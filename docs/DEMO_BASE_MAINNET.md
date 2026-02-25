# Demo: Base Mainnet (Aave V3) Borrow-and-Pay via CRE (Crypto Treasury Bot)

This is the fastest path to a real end-to-end demo:

1. Deploy `BorrowVault` + `BorrowBotReceiver` on Base mainnet
2. Supply cbBTC collateral into Aave via the vault
3. Run `cre workflow simulate --broadcast` to trigger `borrow USDC -> transfer to payee`

## Prereqs

- Node + Yarn
- Base ETH for gas
- cbBTC balance (small, for collateral)
- CRE CLI installed:

```bash
curl -sSL https://cre.chain.link/install.sh -o /tmp/cre-install.sh
bash /tmp/cre-install.sh
~/.cre/bin/cre version
```

If you’re running the TypeScript workflow, install Bun too:

```bash
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
bash /tmp/bun-install.sh
~/.bun/bin/bun --version
```

## 1) Install deps

```bash
yarn install
```

## 2) Set env

Create `.env` at repo root (do not commit):

```bash
BASE_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=0x...
CRE_ETH_PRIVATE_KEY=0x...
DEMO_RUNNER_SECRET=
AGENT_PLAN_SECRET=
```

For safety, use **separate keys**:

- `DEPLOYER_PRIVATE_KEY`: deploy/config/supply/repay actions (one-time, then retire/rotate)
- `CRE_ETH_PRIVATE_KEY`: CRE broadcaster key (gas-only, tiny ETH balance)

If you *do* reuse a single key for a demo, treat it as disposable and keep balances minimal.

If you expose runner or agent APIs beyond localhost, require shared-secret headers:

- `x-demo-runner-secret` for `/api/demo/*`
- `x-agent-secret` for agent `/plan`

## 3) Deploy contracts

```bash
yarn contracts:compile
yarn contracts:deploy:base
```

Copy the deployed addresses for:

- `BorrowVault`
- `BorrowBotReceiver`

The deploy script also updates:

- `cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json`

## 4) Configure the CRE workflow

Edit:

- `cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json`

Set:

- `receiverAddress` = `BorrowBotReceiver`
- `vaultAddress` = `BorrowVault`

## 5) Supply collateral

From a wallet or a small script:

1. Approve `BorrowVault` to spend cbBTC
2. Call `BorrowVault.supplyCollateral(cbBTC, amount)`

Or using the included script:

```bash
VAULT_ADDRESS=0x... COLLATERAL_AMOUNT=12345 yarn contracts:supply:base
```

## 6) Broadcast a spend

For hackathon demos, it’s recommended to run the local agent service and set `agentUrl` so the CRE workflow performs an HTTP call:

1. Start the agent (Terminal 1):

```bash
yarn agent:dev
```

2. Set `agentUrl` in:

- `cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json`

Example value:

- `agentUrl`: `http://127.0.0.1:8787/plan`

Run from repo root (recommended so the default `.env` is found):

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
  --http-payload '{
  "payee": "0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d",
  "borrowAmount": "1000000"
}'
```

If everything is configured correctly, BaseScan should show:

- a forwarder tx to `BorrowBotReceiver`
- `BorrowVault` borrowing USDC on Aave
- a USDC transfer to `payee`

## Cleanup (repay)

The vault includes an owner-only helper to repay Aave debt:

- `BorrowVault.repayDebt(borrowAsset, amount)`

Or use the included script:

```bash
BORROW_AMOUNT_HUMAN=1 yarn contracts:repay:base
```

To withdraw collateral (after repaying, recommended):

```bash
WITHDRAW_AMOUNT_HUMAN=0.0001 yarn contracts:withdraw:base
```
