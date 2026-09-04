# End-to-End Tests

Conventions for the Playwright suite in `tests/` (configured in [`../playwright.config.js`](../playwright.config.js)). Commands and setup live in [`../TESTING.md`](../TESTING.md); the [`testing-guidelines`](../.agents/skills/testing-guidelines/SKILL.md) skill governs test admission.

## GitHub Boundary

Tests MUST never hit the real GitHub API. The GitHub client derives its base URL from `FAKE_GITHUB_PORT`: set, it talks to the fake GitHub server under `tests/fake-github/` at `http://localhost:${FAKE_GITHUB_PORT}`; unset, it falls back to the real API. The harnesses load the committed `.env.test` and abort when `FAKE_GITHUB_PORT` is missing or invalid. Never bypass this boundary — no test may construct a client against the real API, even behind a skip.

## Runtime Assumptions

- `playwright.config.js` assumes `pnpm build` has been run before `pnpm test:e2e`; the web server command is `pnpm preview`, which serves the previous build output. CI must run `pnpm build` first.
- Locally, `reuseExistingServer` is enabled outside CI: if something is already listening on port `4173`, Playwright reuses it instead of starting a fresh server. Stale build output therefore yields stale test results — rebuild when in doubt.
- The Playwright run also starts the fake GitHub server on `http://localhost:${FAKE_GITHUB_PORT}` (`tests/fake-github/start.js`), and the same reuse rule applies: a foreign process already bound to `${FAKE_GITHUB_PORT}` will be adopted with whatever fixture state it has — kill it when in doubt.

## Test-Writing Style

These rules exist because E2E tests share the fake GitHub server state and run serially (`fullyParallel: false`):

- Correctness depends on serial execution — never enable parallelism for E2E tests.
- Use `test.describe` to group related or coupled tests and use cases.
- Assert only a single piece of functionality per `test` block.
- Always run the full suite (`pnpm test:e2e`); suite filters will not work because side effects are sequential across tests.
