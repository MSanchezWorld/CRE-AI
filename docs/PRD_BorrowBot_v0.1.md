# PRD: Borrow-to-Spend AI Agent (Open Source) + Chainlink CRE Verifiable Execution

Product name (working): Crypto Treasury Bot (formerly “BorrowBot”)  
Doc version: v0.1  
Date: Feb 6, 2026  
Owner: (you / team)  
Status: Draft (hackathon-ready)

This PRD is derived from the working draft in the project chat, updated for:

- Wallet connect/auth: **Privy**
- Chain: **Base**
- Lender: **Aave V3**
- Collateral: **cbBTC** (recommended “wrapped BTC” collateral on Base / Aave)
- Borrow/spend: **USDC** (or USDbC if required by the Aave market; MVP can support both)

## 1) Summary

We will build an open-source AI agent that decides when and how much to borrow against a user’s crypto collateral, and uses Chainlink Runtime Environment (CRE) as the verifiable orchestration + execution layer to run the borrow-to-spend workflow onchain.

Core idea:

- AI/agent = probabilistic reasoning (recommend an action plan)
- CRE workflow + onchain consumer/vault contract = deterministic, verifiable execution (enforces policy and performs onchain actions)
- CRE’s execution capabilities (HTTP + EVM) are designed to run with built-in consensus across multiple nodes for security/reliability

## 2) Problem Statement

Crypto holders often want liquidity without selling their assets. Borrowing against crypto is powerful but complex and risky:

- Choosing safe borrow amount requires tracking collateral value, debt, borrow APR, liquidation thresholds, volatility
- The user experience is fragmented (dashboards, manual actions, constant monitoring)
- “Autopilot” products tend to be opaque (“trust the backend”) and are hard to verify

Opportunity: an agent that makes borrowing decisions transparently, while execution is verifiable and constrained by user-defined safety policies.

## 3) Goals

Product goals:

- Autonomous borrowing decisions driven by user policy + market/position context
- Verifiable borrow-to-spend execution onchain via a CRE Workflow + consumer contract pattern
- Open-source, reproducible build (anyone can run, audit, fork)

Hackathon/track alignment goals (CRE & AI):

- Build a CRE Workflow as the orchestration layer integrating (a) at least one blockchain and (b) an external API/LLM/AI agent
- Show a successful simulation via CRE CLI or live deployment
- Public repo + 3–5 minute demo video + README linking Chainlink usage

## 4) Non-goals (for MVP)

- Offering “financial advice” or guaranteeing returns
- Supporting multiple chains/protocols simultaneously (we’ll start with 1: Base + Aave V3)
- Liquidations management across many assets (we’ll support 1–2 assets first)
- Fiat off-ramp or card integration (optional future)

## 5) Target Users & Personas

- Persona A: “Crypto Holder, Needs Cash”
- Persona B: “Onchain Power User”
- Persona C: “Developer / Auditor”

## 6) User Experience Overview

Key user journeys:

### Journey 1: Set up a credit line

- Connect wallet (Privy)
- Deposit collateral into a per-user onchain Vault contract (non-custodial smart contract)
- Vault supplies collateral into Aave V3 (Base) on behalf of the vault
- Set policy:
  - max LTV / min health factor
  - daily/weekly borrow limit
  - approved spend recipients
- Turn on “Auto-borrow” mode

### Journey 2: Spend request (borrow-to-spend)

- User initiates a “Spend $X” request in UI (or API call)
- Agent evaluates the position and proposes borrow amount + route
- CRE workflow executes:
  - borrow stablecoin from Aave
  - transfer to payee onchain
- UI shows tx + updated position

### Journey 3: Safety response

- Collateral value drops / volatility spikes
- Agent recommends: pause borrowing OR repay/deleverage (v1)
- Workflow enforces policy and triggers notifications

## 7) MVP Scope (Hackathon Build)

MVP must demonstrate (minimum):

- CRE Workflow orchestrates the flow and integrates:
  - EVM onchain reads/writes, and
  - an external AI system (LLM call or agent service)
- A successful CRE CLI simulation run (ideally with `--broadcast` to show real tx)

Base + Aave note (mainnet-first):

- Aave V3 is deployed on **Base mainnet**.
- This MVP will run on **Base mainnet** by default, using strict onchain guardrails to keep risk low (caps, allowlists, pause).
- Optional (dev only): support a mock lender on Base Sepolia to iterate without real funds.

## 8) System Architecture

High-level components:

### Frontend (web app)

- Next.js web app
- Privy wallet connect/auth
- Policy config
- Spend request UI
- Status dashboard (collateral, debt, health factor, execution history)

### AI Agent Service (open-source)

- Input: onchain state + user policy + optional market data
- Output: structured Action Plan JSON

### Chainlink CRE Workflow (orchestrator)

- Triggers (HTTP and/or cron)
- Onchain read: fetch vault + Aave state
- Offchain call: agent/LLM decision
- Policy enforcement: validate plan against constraints
- Onchain write: submit instruction to vault contract

### Onchain Contracts

- `BorrowVault` (consumer / executor contract):
  - supplies collateral to Aave
  - borrows from Aave
  - transfers borrowed funds to payee
  - enforces hard safety rules onchain (second line of defense)
- Optional: `PolicyRegistry`, allowlists, routing helpers

## 9) Core Data Model

### Policy (user-configured)

- maxLTV (e.g., 0.50)
- minHealthFactor (e.g., 1.6)
- maxBorrowPerDayUSD (e.g., 200)
- maxBorrowPerTxUSD (e.g., 100)
- cooldownSeconds between executions
- approvedCollateralTokens[]
- approvedBorrowTokens[]
- approvedPayees[] (addresses)
- paused flag (user emergency stop)

### Position snapshot (computed each run)

- collateralAmount, collateralUSD
- debtAmount, debtUSD
- ltv, healthFactor
- borrowAPR, liquidationThreshold
- availableBorrowUSD

### Action Plan (agent output)

- action: `BORROW_AND_PAY | PAUSE | NOOP | (v1: REPAY)`
- borrowToken, borrowAmount
- payee, payAmount
- rationale (short)
- confidence (0–1)
- expiresAt (prevents replay / stale decisions)
- nonce (replay prevention)

Important: The workflow treats the plan as a proposal; it must pass deterministic checks.

## 10) Borrow-to-Spend Workflow Spec (MVP)

Trigger options:

- HTTP trigger: `POST /spend { usdAmount, payee }`
- Cron trigger (optional): check every N minutes and top-up stablecoin buffer

Workflow steps (happy path):

1. Input validation
2. Onchain reads
3. Offchain calls (agent)
4. Deterministic policy enforcement (in workflow)
5. Onchain write (execution)

## 20) Open Questions (not blocking)

- Do we support any BTC wrapper beyond **cbBTC** on Base (or stay strict to what Aave supports)?
- Do we borrow **USDC** only, or allow **USDbC** too depending on market liquidity?

## 21) Future Plans

- Merchant acceptance gating before onchain pay:
  - Require explicit merchant acceptance before `borrow -> transfer` executes.
  - Candidate implementations:
    - Merchant smart contract payee that validates invoice/terms and reverts if not accepted.
    - Offchain signed invoice flow verified by workflow + vault constraints before execution.
    - Optional API-level x402 payment gating for merchant endpoints (distinct from wallet transfer acceptance).
