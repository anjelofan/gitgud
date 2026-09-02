# Testing Guide

Commands (see [`package.json`](package.json)):

| Command               | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `pnpm test:unit`      | Vitest run (node environment)                             |
| `pnpm test:e2e`       | Playwright end-to-end tests (requires `pnpm build` first) |
| `pnpm test`           | Unit tests, then end-to-end tests                         |
| `pnpm test:e2e:setup` | One-time Playwright chromium browser install              |

## Layout

- **Unit/integration tests**: colocated with source files as `src/**/*.test.{js,ts}`, run in the node environment. Configuration lives in the `test` block of [`vite.config.js`](vite.config.js), which excludes `tests/**` (the end-to-end domain). Conventions: [`docs/conventions/unit-test.md`](docs/conventions/unit-test.md).
- **End-to-end tests**: `tests/`, configured in [`playwright.config.js`](playwright.config.js). Conventions: [`tests/AGENTS.md`](tests/AGENTS.md).

## Artifacts

- `vitest-results/.last-run.json` — machine-readable Vitest results, rewritten by the JSON reporter on every run.
- `playwright-results/` — Playwright test artifacts (traces and videos retained on failure).

Both directories are gitignored; never commit them.

## Skill Precedence

[`testing-guidelines`](.agents/skills/testing-guidelines/SKILL.md) is authoritative on whether a test should exist (test admission). Framework documentation — Context7 (`/vitest-dev/vitest`, `/microsoft/playwright`) and any tooling skills — is consulted for tool mechanics only.
