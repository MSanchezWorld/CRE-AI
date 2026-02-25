# Hackathon Final Checklist

## Must-Have

1. Public repo with clear README.
2. Working end-to-end flow:
   - collateral supplied
   - CRE workflow broadcast
   - onchain borrow + pay transfer
3. Demo video (3-5 min) showing real execution and proof links.
4. Chainlink usage clearly documented (workflow + receiver + configs).

## Pre-Submission Verification

1. `yarn install`
2. `yarn contracts:compile`
3. `yarn contracts:test`
4. `yarn web:build`
5. Run the Base demo runbook in `docs/DEMO_BASE_MAINNET.md`.

## Security for Demo Day

1. Use separate low-balance keys for deployer vs CRE broadcaster.
2. Keep API runners disabled in production unless needed.
3. If exposed, require secrets:
   - `DEMO_RUNNER_SECRET`
   - `AGENT_PLAN_SECRET`
4. Keep per-tx and daily borrow caps conservative.

## Submission Assets

1. Architecture diagram
2. BaseScan links for deployed contracts and a successful tx
3. Short write-up:
   - problem
   - approach
   - what is verifiable
   - limitations and next steps
