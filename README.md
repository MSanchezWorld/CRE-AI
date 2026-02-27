# BorrowBot — AI Agents with Self-Sustaining Treasuries

**AI agents that earn, borrow, and pay — without selling their assets.**

BorrowBot uses [Chainlink CRE](https://chain.link/cre) to give AI agents their own on-chain treasuries on Aave V3. An agent deposits collateral (WETH + cbBTC), earns yield automatically, and borrows USDC to pay for services — all verified by a decentralized oracle network. No single point of trust.

**Live on Base mainnet.** Try the interactive demo: [borrowbot.app/demo](https://borrowbot.app/demo)

---

## How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Agent Wallet │────>│  Treasury Vault  │────>│ Service Provider │
│   (USDC)    │     │   (Aave V3)      │     │    (Payee)       │
└─────────────┘     └──────────────────┘     └──────────────────┘
                           │    │
                    deposit│    │borrow & pay
                           │    │
                    ┌──────┴────┴──────┐
                    │  Chainlink CRE   │
                    │  (verification)  │
                    └──────────────────┘
```

1. **Deposit** — Agent deposits USDC, swapped 50/50 into WETH + cbBTC, supplied to Aave V3 as collateral.
2. **Earn** — Collateral earns yield automatically. The treasury grows while the agent operates.
3. **Propose** — Agent submits a spend plan (payee, amount, reason). The owner approves.
4. **Verify** — CRE's decentralized network independently verifies: allowlisted payee, amount within limits, correct nonce, safe health factor.
5. **Pay** — Vault borrows USDC from Aave and pays the service provider. Collateral keeps earning.

The agent never has direct access to the funds. Every spend is proposed, approved, and verified before execution.

---

## Architecture

```
borrowbot/
├── apps/
│   ├── web/                    # Next.js demo UI + API routes
│   └── agent/                  # Minimal agent HTTP server
├── packages/
│   └── contracts/              # Solidity contracts (Hardhat)
│       ├── BorrowVault.sol         # Core vault — Aave V3 supply, borrow, policy guards
│       └── BorrowBotReceiver.sol   # CRE receiver — decodes reports, calls vault
├── cre/
│   └── workflows/
│       └── borrowbot-borrow-and-pay/
│           ├── main.ts             # CRE workflow (HTTP trigger, EVM reads, EVM write)
│           ├── workflow.yaml       # Target mapping
│           └── config.mainnet.json # Runtime config
└── docs/                       # Product documentation
```

**Monorepo** managed with Yarn workspaces.

---

## Chainlink CRE Integration

All files that use Chainlink CRE:

| File | Role |
|------|------|
| [`cre/project.yaml`](cre/project.yaml) | CRE project config + RPC targets |
| [`cre/workflows/borrowbot-borrow-and-pay/workflow.yaml`](cre/workflows/borrowbot-borrow-and-pay/workflow.yaml) | Workflow target mapping |
| [`cre/workflows/borrowbot-borrow-and-pay/main.ts`](cre/workflows/borrowbot-borrow-and-pay/main.ts) | Workflow code: HTTP trigger, agent call, EVM reads, EVM writeReport |
| [`cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json`](cre/workflows/borrowbot-borrow-and-pay/config.mainnet.json) | Mainnet runtime config |
| [`packages/contracts/contracts/BorrowBotReceiver.sol`](packages/contracts/contracts/BorrowBotReceiver.sol) | CRE onchain write receiver/consumer |
| [`packages/contracts/contracts/cre/ReceiverTemplate.sol`](packages/contracts/contracts/cre/ReceiverTemplate.sol) | Forwarder validation + metadata decoding |
| [`packages/contracts/contracts/cre/IReceiver.sol`](packages/contracts/contracts/cre/IReceiver.sol) | CRE receiver interface |
| [`packages/contracts/scripts/deployBorrowBotBase.ts`](packages/contracts/scripts/deployBorrowBotBase.ts) | Deployment with CRE forwarder config |

---

## Quickstart

### Prerequisites

- Node.js 18+
- Yarn 1.x
- [CRE CLI](https://docs.chain.link/cre) (for workflow simulation)
- A funded wallet on Base mainnet (ETH for gas + USDC for collateral)

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/borrowbot.git
cd borrowbot
yarn install
cp .env.example .env
# Edit .env with your keys (see .env.example for details)
```

### 2. Compile Contracts

```bash
yarn contracts:compile
```

### 3. Deploy to Base Mainnet

```bash
yarn contracts:deploy:base
yarn contracts:configure:base
```

This deploys `BorrowVault` + `BorrowBotReceiver` and configures policy guards (allowlisted payees, borrow limits).

### 4. Deposit Collateral

```bash
DEPOSIT_AMOUNT_HUMAN=10 yarn contracts:deposit:base
```

### 5. Start the Agent + Web UI

```bash
# Terminal 1: agent server
yarn agent:dev

# Terminal 2: web app
yarn web:dev
```

### 6. Run CRE Workflow

One-time setup (TypeScript to WASM compilation):

```bash
cd cre/workflows/borrowbot-borrow-and-pay
bun --bun node_modules/@chainlink/cre-sdk-javy-plugin/bin/setup.ts
cd ../../..
```

Simulate with broadcast:

```bash
~/.cre/bin/cre workflow simulate ./workflows/borrowbot-borrow-and-pay \
  -R ./cre \
  -T mainnet-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{"payee":"YOUR_PAYEE_ADDRESS","amount":"1000000"}'
```

### 7. Cleanup

```bash
BORROW_AMOUNT_HUMAN=1 yarn contracts:repay:base
yarn contracts:reset-aave:base
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. See the file for descriptions of each variable.

**Required for deployment:**
- `DEPLOYER_PRIVATE_KEY` — Wallet private key (funds the vault, deploys contracts)
- `BASE_RPC_URL` — Base mainnet RPC (defaults to `https://base.drpc.org`)

**Required for CRE:**
- `CRE_ETH_PRIVATE_KEY` — Separate key for CRE workflow broadcasts (gas-only wallet)

**Required for web UI:**
- `NEXT_PUBLIC_PRIVY_APP_ID` — Privy app ID for wallet connect

**Security:** Use separate keys for deployer and CRE broadcaster. Keep `ENABLE_DEMO_RUNNER` and `ENABLE_RESET_RUNNER` disabled in production.

---

## Key Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| Aave V3 PoolAddressesProvider | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| CRE Mock Forwarder (simulation) | `0x5e342a8438b4f5D39E72875FcEE6F76B39CCe548` |
| CRE Production Forwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

---

## Scripts Reference

All scripts are in `packages/contracts/scripts/` and run via root `package.json`:

| Command | What it does |
|---------|-------------|
| `yarn contracts:deploy:base` | Deploy BorrowVault + BorrowBotReceiver |
| `yarn contracts:configure:base` | Post-deploy policy configuration |
| `yarn contracts:deposit:base` | Deposit USDC (swap to WETH+cbBTC, supply to Aave) |
| `yarn contracts:supply:base` | Supply existing cbBTC to Aave |
| `yarn contracts:repay:base` | Repay a specific borrow amount |
| `yarn contracts:withdraw:base` | Withdraw collateral from Aave |
| `yarn contracts:reset-aave:base` | Full reset (repay all debt, withdraw all collateral) |
| `yarn contracts:swap-to-usdc:base` | Swap collateral tokens back to USDC |

---

## License

MIT

---

Built by Miguel Sanchez — [miguel@stackit.ai](mailto:miguel@stackit.ai)
