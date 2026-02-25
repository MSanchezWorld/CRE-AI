# CRE project (Base mainnet)

This folder contains a Chainlink CRE project (`project.yaml`) and a TypeScript workflow package in `workflows/borrowbot-borrow-and-pay`.

## Install CRE CLI (macOS)

```bash
curl -sSL https://cre.chain.link/install.sh -o /tmp/cre-install.sh
bash /tmp/cre-install.sh
~/.cre/bin/cre version
```

CRE TypeScript workflows recommend Bun:

```bash
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
bash /tmp/bun-install.sh
~/.bun/bin/bun --version
```

## Simulate (broadcast)

1. Ensure you have `CRE_ETH_PRIVATE_KEY` set in your environment (do not commit it).
2. Update `workflows/borrowbot-borrow-and-pay/config.mainnet.json` with your deployed contract addresses.
3. Run:

```bash
cd workflows/borrowbot-borrow-and-pay
cre workflow simulate --target mainnet-settings --broadcast --http-payload '{"payee":"0x...","borrowAmount":"1000000"}'
```
