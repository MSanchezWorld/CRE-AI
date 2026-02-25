# Support

## Getting Help

1. Read the root `README.md` and `docs/DEMO_BASE_MAINNET.md`.
2. Verify your `.env` values and wallet funding for Base gas.
3. Run:

```bash
yarn contracts:compile
yarn contracts:test
yarn web:build
```

## Common Issues

1. RPC instability or rate limits:
   - Try a different `BASE_RPC_URL`.
   - Use `BASE_RPC_URL_OVERRIDE` for demo routes.
2. Demo runner disabled:
   - Set `ENABLE_DEMO_RUNNER=true` / `ENABLE_RESET_RUNNER=true` only in trusted environments.
3. Agent returns unauthorized:
   - Ensure `AGENT_PLAN_SECRET` matches the `x-agent-secret` header used by the caller.

## Security Issues

For vulnerabilities, follow `SECURITY.md` and do not disclose publicly first.
