# borrowbot-borrow-and-pay (CRE workflow for Crypto Treasury Bot)

This workflow:

1. Reads `BorrowVault.nonce()` and `BorrowVault.paused()` on Base
2. Builds a `BorrowAndPayPlan` report
3. Submits it via `EVMClient.writeReport()` to `BorrowBotReceiver`

## Configure

Edit `config.mainnet.json`:

- `receiverAddress`: deployed `BorrowBotReceiver`
- `vaultAddress`: deployed `BorrowVault`
- `borrowAsset`: default USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- `agentSecret` (optional): if set, sent as `x-agent-secret` to `agentUrl`

## Simulate (broadcast)

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

`borrowAmount` is in token units (USDC has 6 decimals, so `1000000` = 1 USDC).

## Optional: agent URL

If you set `agentUrl` in `config.mainnet.json`, the workflow will POST deterministic JSON to that endpoint:

```json
{
  "spendRequest": {
    "borrowAsset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "borrowAmount": "1000000",
    "payee": "0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d"
  },
  "vault": {
    "address": "0x...",
    "currentNonce": "0"
  }
}
```

The agent should respond with at least:

```json
{
  "borrowAsset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "borrowAmount": "1000000",
  "payee": "0x42444551e2b5FEb7A7c2eE4dA38993381B08Bc6d"
}
```
