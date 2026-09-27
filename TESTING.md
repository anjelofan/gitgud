# Testing Guide

Commands (see [`package.json`](package.json)):

| Command               | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `pnpm test:unit`      | Vitest run (node environment)                             |
| `pnpm test:e2e`       | Playwright end-to-end tests (requires `pnpm build` first) |
| `pnpm test`           | Unit tests, then end-to-end tests                         |
| `pnpm test:e2e:setup` | One-time Playwright chromium browser install              |
| `pnpm test:secrets`   | Generate local fake GitHub App secrets                    |

## Layout

- **Unit/integration tests**: colocated with source files as `src/**/*.test.{js,ts}`, run in the node environment. Configuration lives in the `test` block of [`vite.config.js`](vite.config.js), which excludes `tests/**` (the end-to-end domain). Conventions: [`docs/conventions/unit-test.md`](docs/conventions/unit-test.md).
- **End-to-end tests**: `tests/`, configured in [`playwright.config.js`](playwright.config.js). Conventions: [`tests/AGENTS.md`](tests/AGENTS.md).

Before the first test run, generate a local fake GitHub App key:

```sh
pnpm test:secrets
```

This writes `.env.test.local`, which is gitignored. It generates the fake App
client secret, session secret, and RSA private key. The client ID stays in
committed `.env.test` because it is public. Fake GitHub never verifies the
RSA signature. Regenerate anytime by deleting `.env.test.local` first.

The fake GitHub server (`tests/fake-github/`) stands in for the real API during tests. The committed [`.env.test`](.env.test) supplies its port (`FAKE_GITHUB_PORT`), database URL, and public fake client ID. Run `pnpm test:secrets` once to create local fake secrets; harnesses abort with instructions when they are missing. The app itself uses the real GitHub API when the variable is unset.

## Local Test Database

Tests never touch the development database. Both harnesses (Vitest and the
Playwright preview server) get `DATABASE_URL` from [`.env.test`](.env.test),
which points at a dedicated, disposable PostgreSQL container on port 5433
([`compose.test.yml`](compose.test.yml)) — separate from the dev database on 5432.

```sh
pnpm docker:test          # start the container, wait for health, migrate
pnpm docker:test:down     # stop and discard it
```

The container stores data in memory (tmpfs): every `pnpm docker:test:down`
wipes it, and every fresh `pnpm docker:test` starts empty and re-applies
migrations. After changing the schema while the container is up, re-run
`pnpm db:test:migrate`.

`pnpm test:unit` truncates tables in this database (`TRUNCATE users CASCADE`
in `src/lib/server/auth/sessions.test.ts`) — never point `DATABASE_URL` at a
database holding data you care about. CI supplies its own `DATABASE_URL` for
its service container; the committed value only applies to local runs.

## Artifacts

- `vitest-results/.last-run.json` — machine-readable Vitest results, rewritten by the JSON reporter on every run.
- `playwright-results/` — Playwright test artifacts (traces and videos retained on failure).

Both directories are gitignored; never commit them.

## Skill Precedence

[`testing-guidelines`](.agents/skills/testing-guidelines/SKILL.md) is authoritative on whether a test should exist (test admission). Framework documentation — Context7 (`/vitest-dev/vitest`, `/microsoft/playwright`) and any tooling skills — is consulted for tool mechanics only.
