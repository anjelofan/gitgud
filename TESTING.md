# Testing Guide

Commands (see [`package.json`](package.json)):

| Command | What it does |
| --- | --- |
| `pnpm test:unit` | Vitest run (node environment) |
| `pnpm test:e2e` | Playwright end-to-end tests (requires `pnpm build` first) |
| `pnpm test` | Unit tests, then end-to-end tests |
| `pnpm test:e2e:setup` | One-time Playwright chromium browser install |

## Layout

- **Unit/integration tests**: colocated with source files as `src/**/*.test.{js,ts}`, run in the node environment. Configuration lives in the `test` block of [`vite.config.js`](vite.config.js), which excludes `tests/**` (the end-to-end domain).
- **End-to-end tests**: `tests/`, configured in [`playwright.config.js`](playwright.config.js).

## E2E Assumptions

`playwright.config.js` assumes `pnpm build` has been run before `pnpm test:e2e`; the web server command is `pnpm preview`, which serves the previous build output. CI must run `pnpm build` first.

Locally, `reuseExistingServer` is enabled outside CI: if something is already listening on port 4173, Playwright reuses it instead of starting a fresh server. Stale build output therefore yields stale test results — rebuild when in doubt.

## Test-Writing Style

These rules apply to end-to-end tests; they exist because E2E tests share the fake GitHub server state and run serially (`fullyParallel: false`):

- Correctness depends on serial execution — never enable parallelism for E2E tests.
- Use `test.describe` to group related or coupled tests and use cases.
- Assert only a single piece of functionality per `test` block.
- Always run the full suite; suite filters will not work because side effects are sequential across tests.

## GitHub Boundary

Tests must never hit the real GitHub API. The GitHub client reads its base URL from `GITHUB_API_BASE` (falling back to the real API when unset); tests point it at the fake GitHub server under `tests/fake-github/`. The fake server's endpoint contract will be documented here once it is introduced.

## Artifacts

- `vitest-results/.last-run.json` — machine-readable Vitest results, rewritten by the JSON reporter on every run.
- `playwright-results/` — Playwright test artifacts (traces and videos retained on failure).

Both directories are gitignored; never commit them.

## Skill Precedence

[`testing-guidelines`](.agents/skills/testing-guidelines/SKILL.md) is authoritative on whether a test should exist (test admission). Framework documentation — Context7 (`/vitest-dev/vitest`, `/microsoft/playwright`) and any tooling skills — is consulted for tool mechanics only.
