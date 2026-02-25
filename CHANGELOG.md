# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Shared-secret auth guards for sensitive demo runner API routes (`x-demo-runner-secret` / `DEMO_RUNNER_SECRET`).
- Shared-secret auth support for agent planning endpoints (`x-agent-secret` / `AGENT_PLAN_SECRET`).
- CRE workflow support for optional agent auth header (`agentSecret` in workflow config).
- Baseline contract test suite for `BorrowVault` policy and replay protections.
- GitHub CI workflow for install, build, compile, and tests.
- Open-source maintainer docs: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`.
