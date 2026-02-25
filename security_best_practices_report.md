# Security Best Practices Report (Crypto Treasury Bot)

Date: 2026-02-07

Scope reviewed:

- Smart contracts: `packages/contracts/contracts/*`
- CRE workflow: `cre/workflows/borrowbot-borrow-and-pay/*`
- Agent service: `apps/agent/server.mjs`
- Web app: `apps/web/*`
- Docs/ops: `.env.example`, `docs/DEMO_BASE_MAINNET.md`, root `README.md`

## Executive Summary

Crypto Treasury Bot is a hackathon MVP that already has good safety primitives onchain (allowlists, nonce-based replay protection, cooldown, per-tx/per-day caps, and health factor checks). The biggest security risks are **operational** (private key handling) and **production-hardening gaps** (unauthenticated CRE HTTP trigger, receiver not pinned to a specific workflow, and an agent endpoint without auth if deployed publicly).

If you want this to be safe enough to run on mainnet beyond a demo, the top priority is:

1. Treat all private keys as compromised-by-default: **separate keys**, **minimize funds**, and avoid storing them in a Dropbox-synced `.env`.
2. Lock down workflow invocation: enable **signed requests** (`authorizedKeys`) and **pin the receiver** to expected workflow metadata.
3. Keep web dependencies patched (especially Next.js).

## Changes Applied In This Repo (2026-02-07)

- Demo docs now discourage key reuse and recommend separate keys:
  - `docs/DEMO_BASE_MAINNET.md:46`
  - `README.md:66`
- Web app dependency bumped to a patched Next.js range:
  - `apps/web/package.json:15` (`next: ^15.1.9`)

---

## Critical Findings

### [C-01] Private Key Operational Risk (Single Hot Key + `.env` in Synced Folder)

Impact: A leaked private key can result in full loss of funds and control (deployer wallet funds, CRE broadcaster funds, and the vault owner privileges if they share keys).

Rule ID: NEXT-SEC-OPS-001 (secrets handling; general)

Evidence:

- `.env.example` references `DEPLOYER_PRIVATE_KEY` and `CRE_ETH_PRIVATE_KEY` (`.env.example:6`, `.env.example:10`).

Notes:

- A repo-root `.env` exists locally (intended, and gitignored via `.gitignore`), but storing real mainnet keys there inside a cloud-synced directory is still a meaningful risk.

Fix:

- Use **separate keys**:
  - `DEPLOYER_PRIVATE_KEY`: used only for one-time deploy/config/supply actions, then rotate/retire.
  - `CRE_ETH_PRIVATE_KEY`: dedicated broadcaster key with tiny ETH balance (gas only).
- Prefer secure storage:
  - local-only secrets store (1Password/Keychain), `.env` outside the repo, or a secrets manager in CI.
- Never reuse a “real funds” key for hackathon demos.

Mitigations:

- Keep onchain policy caps low (`maxBorrowPerTx`, `maxBorrowPerDay`) for the vault, and keep the broadcaster wallet minimally funded.

---

## High Findings

### [H-01] CRE HTTP Trigger Has No Request Authentication (`authorizedKeys` empty)

Impact: If this workflow is deployed and exposed, attackers can trigger executions, potentially burning broadcaster gas and attempting unauthorized spends (vault onchain caps will likely revert the borrow, but gas can still be burned).

Rule ID: NEXT-AUTH-001 (auth on request-facing endpoints; general)

Evidence:

- `cre/workflows/borrowbot-borrow-and-pay/main.ts:142-146` sets `authorizedKeys: []`.

Fix:

- For any deployed/public workflow: require signed requests via `authorizedKeys` and keep the trigger behind an authenticated gateway.

Mitigation:

- Keep running via local `cre workflow simulate` for hackathon demos, and keep `--broadcast` amounts tiny.

---

### [H-02] Receiver Not Pinned to Expected Workflow Metadata (Forwarder-Only Check)

Impact: If the configured forwarder can forward reports from multiple workflows/users, then any workflow that can produce a valid report via that forwarder could call `BorrowBotReceiver` and attempt execution (vault guardrails still apply, but this widens the trust boundary).

Rule ID: CRE-AUTHZ-001 (pin consumer to expected workflow identity; project-specific)

Evidence:

- `packages/contracts/contracts/cre/ReceiverTemplate.sol:13-78` supports metadata validation, but it is optional and not configured by default.

Fix:

- Set at least one of:
  - `expectedWorkflowId`, and/or
  - `expectedAuthor` (+ optionally `expectedWorkflowName`)

Mitigation:

- Ensure the forwarder itself is scoped to your workflow(s) only.

---

### [H-03] Agent Service Has No Authentication / Network Binding Safety

Impact: If `HOST` is set to `0.0.0.0` or deployed publicly, anyone can request “plans”, potentially causing undesired spend attempts (and enabling DoS on the workflow path).

Rule ID: EXPRESS-INPUT-001 / EXPRESS-AUTH-001 (validate inputs; require auth for state-changing/privileged endpoints)

Evidence:

- `apps/agent/server.mjs:3-4` binds by env (`HOST`, `PORT`).
- `apps/agent/server.mjs:46-78` accepts any POST `/plan` without auth and logs the plan (`apps/agent/server.mjs:76`).

Fix:

- Bind to `127.0.0.1` by default (current default is good); keep it that way in production.
- Add a shared-secret header (HMAC/API key) between workflow and agent.
- Add basic rate limiting / request timeouts.

---

### [H-04] Demo Runner API Spawns CRE + Broadcasts With No Auth (`/api/demo/run`)

Impact: If the web app is deployed publicly with this endpoint enabled, **anyone** can trigger a CRE broadcast run (burning gas at minimum, and potentially causing unauthorized spend attempts that will revert or succeed depending on onchain policy).

Rule ID: NEXT-AUTH-001 (state-changing endpoints must be authenticated/authorized)

Evidence:

- `apps/web/app/api/demo/run/route.ts` runs `cre workflow simulate ... --broadcast` via `spawn()` and accepts attacker-controlled `payee` and `borrowAmount`.
 - `apps/web/app/api/demo/reset/route.ts` and `apps/web/app/api/demo/swap-to-usdc/route.ts` spawn Hardhat scripts that send real mainnet txs using `DEPLOYER_PRIVATE_KEY`.

Fix:

- Treat this endpoint as **local-demo-only**:
  - require an auth header (shared secret), and/or
  - restrict to localhost only, and/or
  - disable the route entirely in production builds.

Status (in this repo):

- The route is now **disabled by default in production** unless `ENABLE_DEMO_RUNNER=true` is explicitly set (`apps/web/app/api/demo/run/route.ts`).
 - Reset/swap runners are also **disabled by default in production** unless `ENABLE_RESET_RUNNER=true` is explicitly set.

Mitigation:

- Keep vault policy caps tiny (per-tx / per-day) and keep broadcaster wallet minimally funded.

---

## Medium Findings

### [M-01] Onchain Borrow Caps Assume Stablecoin Units (Decimals Coupling)

Impact: If a non-6-decimal borrow token is allowlisted, `maxBorrowPerTx` / `maxBorrowPerDay` may not represent the intended USD limit.

Rule ID: CRE-POLICY-001 (policy math must be consistent with token decimals; project-specific)

Evidence:

- Policy variables are “assumed stablecoin units” (`packages/contracts/contracts/BorrowVault.sol:28-30`).
- Limits enforced against raw token amounts (`packages/contracts/contracts/BorrowVault.sol:203-205`).

Fix:

- Restrict `approvedBorrowTokens` to a single known decimal stablecoin for MVP, or store per-asset limits adjusted for decimals.

---

### [M-02] CRE Consensus Mode Requires Deterministic Agent Output

Impact: `consensusIdenticalAggregation` will fail if the agent output is non-deterministic (typical for LLMs), which can halt execution or cause repeated failures.

Rule ID: CRE-RELIABILITY-001 (consensus requires deterministic/offchain agreement)

Evidence:

- `cre/workflows/borrowbot-borrow-and-pay/main.ts:233-236` uses `consensusIdenticalAggregation<AgentPlan>()`.

Fix:

- Keep the agent deterministic (rule-based + strict JSON), or switch to an aggregation strategy compatible with probabilistic outputs.

---

## Low Findings / Hardening Suggestions

### [L-01] Key Reuse Guidance (Docs Should Stay Opinionated)

Evidence:

- `docs/DEMO_BASE_MAINNET.md:46` recommends separate keys (good).

Fix:

- Keep docs explicit about separate keys, minimal balances, and rotation.

---

## What’s Already Good

- Strong onchain guardrails in `BorrowVault`:
  - allowlists (`approvedBorrowTokens`, `approvedPayees`), replay protection via `nonce`, TTL (`planExpiresAt`), cooldown and daily/per-tx limits, and pre/post health factor checks (`packages/contracts/contracts/BorrowVault.sol:186-219`).
- Receiver template checks `msg.sender == forwarder` (`packages/contracts/contracts/cre/ReceiverTemplate.sol:63-65`).

---

## Suggested Next Fixes (Order)

1. Key separation + storage changes (operational).
2. Add `authorizedKeys` (and deploy-time auth) for any public workflow trigger.
3. Configure `ReceiverTemplate` metadata validation on mainnet deployments.
