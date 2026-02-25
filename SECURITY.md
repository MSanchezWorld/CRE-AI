# Security Policy

## Supported Scope

This repository is a hackathon MVP that can execute real onchain transactions on Base mainnet. Treat it as high-risk software until fully audited.

## Reporting a Vulnerability

Please do not open public issues for undisclosed vulnerabilities.

Send a private report with:

1. Affected component and file path
2. Impact summary
3. Reproduction steps
4. Suggested fix (if available)

Use maintainer contact channels for private disclosure.

## Operational Security Requirements

1. Never commit private keys.
2. Use separate wallets:
   - `DEPLOYER_PRIVATE_KEY` for deploy/admin actions
   - `CRE_ETH_PRIVATE_KEY` for CRE broadcasting only
3. Keep balances minimal on demo wallets.
4. Keep demo runners disabled in production unless explicitly needed.
5. Require shared secrets when exposing privileged endpoints:
   - `DEMO_RUNNER_SECRET`
   - `AGENT_PLAN_SECRET`

## Hardening Notes

If this project is deployed beyond a hackathon demo:

1. Add authentication and rate limiting in front of all privileged API routes.
2. Restrict network access to runner/agent services (VPN, allowlists, private subnets).
3. Add contract and integration tests for all critical policy paths.
4. Conduct an external security review before handling meaningful funds.
