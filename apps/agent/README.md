# Crypto Treasury Bot Agent (HTTP)

This is a minimal HTTP "agent" service the Chainlink CRE workflow can call via `agentUrl`.

## Run

From repo root:

```bash
yarn workspace @borrowbot/agent dev
```

Health check:

```bash
curl http://127.0.0.1:8787/
```

Plan endpoint:

- `POST /plan` expects the JSON payload emitted by the CRE workflow.
- Returns a plan object consumed by the workflow.

## Optional Auth

If `AGENT_PLAN_SECRET` is set, `/plan` requires:

- Header: `x-agent-secret: <AGENT_PLAN_SECRET>`
