# Contributing

## Development Setup

1. Install dependencies:

```bash
yarn install
```

2. Run the web app:

```bash
yarn web:dev
```

3. Run the local agent:

```bash
yarn agent:dev
```

4. Compile and test contracts:

```bash
yarn contracts:compile
yarn contracts:test
```

## Pull Request Checklist

1. Keep changes scoped to one concern.
2. Add or update tests when logic changes.
3. Run `yarn contracts:test` and `yarn web:build` before opening a PR.
4. Update docs if behavior, env vars, or runbooks changed.

## Commit and PR Style

1. Use descriptive titles, e.g. `api: require demo runner secret in production`.
2. Include a short "what changed" and "how to verify" section in PR description.
3. For security-sensitive changes, link to the relevant section in `SECURITY.md`.
