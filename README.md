# Crypto Treasury Bot (Borrow-to-Spend AI Agent) + Chainlink CRE

Open-source agent + verifiable workflow that borrows against BTC collateral on **Aave V3 (Base mainnet)** and pays on-chain using borrowed **USDC**.

Note on “WBTC”:

- On Base, Aave’s BTC collateral is typically **cbBTC** (not Ethereum’s WBTC). This MVP treats “wrapped BTC” as **cbBTC by default**.

This repo is currently scaffolded (hackathon-ready). It includes:

- `apps/web`: Next.js app with **Privy** wallet connect, configured for **Base**.
- `packages/contracts`: Solidity contracts:
  - `BorrowVault`: per-user Aave vault with strict onchain policy guards
  - `BorrowBotReceiver`: Chainlink CRE Onchain Write consumer that calls the vault verifiably
- `docs`: Product doc / PRD.

## Chainlink Files

Hackathon requirement: link to all files that use Chainlink / CRE.

- `cre/project.yaml` (CRE project + RPC targets)
- `cre/workflows/borrowbot-borrow-and-pay/workflow.yaml` (workflow target mapping)
- `cre/workflows/borrowbot-borrow-and-pay/main.ts` (CRE workflow code: HTTP trigger, HTTP agent call, EVM reads, EVM writeReport)
- `cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json` (mainnet config used by the workflow)
- `packages/contracts/contracts/BorrowBotReceiver.sol` (CRE onchain write receiver / consumer)
- `packages/contracts/contracts/cre/ReceiverTemplate.sol` (forwarder + optional metadata validation)
- `packages/contracts/contracts/cre/IReceiver.sol` (CRE receiver interface)
- `packages/contracts/scripts/deployBorrowBotBase.ts` (uses CRE forwarder addresses and updates workflow config)

## Status

- Sandbox commands in Codex don’t have DNS; anything that hits Base RPC needs to run outside the sandbox (escalated).
- This repo is set up to run end-to-end on Base mainnet (real tx) once the deployer wallet is funded.

## Quickstart (local dev)

1. Install deps

```bash
yarn install
```

2. Web app

```bash
yarn web:dev
```

3. Contracts

```bash
yarn contracts:compile
```

## Environment

Create `.env` at repo root:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
BASE_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=0x...
CRE_ETH_PRIVATE_KEY=0x...
DEMO_RUNNER_SECRET=
AGENT_PLAN_SECRET=
```

Security note (mainnet):

- Use separate keys for `DEPLOYER_PRIVATE_KEY` and `CRE_ETH_PRIVATE_KEY`.
- Keep the CRE broadcaster wallet funded with gas-only (tiny ETH).
- If you expose privileged routes, set `DEMO_RUNNER_SECRET` and `AGENT_PLAN_SECRET`.

## Deployment Modes

Recommended for hackathons:

1. Public host only `apps/web`.
2. Keep transaction runners and the agent in a private environment you control.
3. Keep `ENABLE_DEMO_RUNNER` and `ENABLE_RESET_RUNNER` disabled unless you explicitly need them.

If you enable runner routes in production, require header auth:

- Demo runner routes (`/api/demo/*`): `x-demo-runner-secret` must match `DEMO_RUNNER_SECRET`.
- Agent planning route (`/api/agent/plan` and `apps/agent /plan`): `x-agent-secret` must match `AGENT_PLAN_SECRET`.

## Networks / Aave

The `BorrowVault` is Aave-address-provider driven. For Base mainnet, Aave V3 PoolAddressesProvider is:

- Base: `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D`

You pass that at deployment time; the vault calls `getPool()` each execution so upgrades are handled.

Default token addresses (Base mainnet):

- cbBTC: `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDbC (optional): `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA`

## CRE Onchain Write (Forwarders)

The CRE simulator uses a **mock forwarder** for `--broadcast` runs; deployed workflows use a **production forwarder**.

- Base mock forwarder (simulation): `0x5e342a8438b4f5D39E72875FcEE6F76B39CCe548`
- Base forwarder (production): `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`

Your consumer contract (`BorrowBotReceiver`) must accept whichever forwarder you’re using.

## Mainnet Demo Path (Recommended)

Goal: 1 real tx flow on Base mainnet:

1. Supply cbBTC collateral into Aave via `BorrowVault`
2. CRE workflow writes a report to `BorrowBotReceiver`
3. Receiver calls `BorrowVault.executeBorrowAndPay()` to borrow USDC and transfer to a payee

After the demo, the owner can unwind debt via `BorrowVault.repayDebt()` (owner-only).

### 1) Deploy contracts on Base

```bash
yarn contracts:compile
yarn contracts:deploy:base
```

The deploy script defaults to the CRE **mock forwarder** (so `cre workflow simulate --broadcast` works).

### 2) Supply collateral

- Approve the vault to spend your cbBTC
- Call `BorrowVault.supplyCollateral(cbBTC, amount)`

### 3) Run CRE simulation (broadcast)

Install the CRE CLI, then run from repo root (recommended so the default `.env` is found):

To include the offchain AI/agent call (hackathon requirement), start the local agent in another terminal and set `agentUrl`:

- Start: `yarn agent:dev`
- Config: `cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json` (`agentUrl: "http://127.0.0.1:8787/plan"`)

One-time setup (required for TypeScript → WASM compilation):

```bash
cd cre/workflows/borrowbot-borrow-and-pay
bun --bun node_modules/@chainlink/cre-sdk-javy-plugin/bin/setup.ts
cd ../../..
```

```bash
~/.cre/bin/cre workflow simulate ./workflows/borrowbot-borrow-and-pay \
  -R ./cre \
  -T mainnet-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{...}'
```

The workflow should submit a report via the forwarder, which calls `BorrowBotReceiver.onReport()`.

### Cleanup (repay + withdraw)

```bash
BORROW_AMOUNT_HUMAN=1 yarn contracts:repay:base
WITHDRAW_AMOUNT_HUMAN=0.0001 yarn contracts:withdraw:base
```

## Docs

See `docs/PRD_BorrowBot_v0.1.md`.

For a step-by-step real broadcast run on Base mainnet, see `docs/DEMO_BASE_MAINNET.md`.

For final submission readiness, see `docs/HACKATHON_FINAL_CHECKLIST.md`.
