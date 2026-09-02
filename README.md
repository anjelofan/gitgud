# gitgud

A GitHub-based classroom platform. Teachers create classrooms linked to a GitHub org, import rosters from CSV, and publish assignments with deadlines and GitHub Actions autograding. Students claim roster entries, join teams, and accept assignments via invitation links — everything lives in real GitHub repos, and scores flow back to the teacher dashboard via workflow webhooks and polling.

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/docs/svelte) (runes), TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL 17
- [pnpm](https://pnpm.io) (≥11, see `packageManager` in [`package.json`](package.json))
- [OpenTelemetry](https://opentelemetry.io) (optional OTLP/HTTP export)

## Features

- **Auth** — GitHub sign-in via a GitHub App; roles resolved as teacher (org owner/classroom creator) or student (claimed roster entry).
- **Teacher** — create classrooms linked to existing GitHub orgs, load students from CSV with an invite/claim flow, create assignments with deadlines and autograding, lock pushes after deadlines, flag late submissions, manage/archive classrooms and assignments, view score dashboards and export to CSV.
- **Student** — claim a roster entry, create or join a team, accept assignments via invitation link (individual repo or team repo with write access for all members).
- **Autograding** — powered by a GitHub Actions workflow already included in the template repo; scores are captured on workflow completion via webhook with polling fallback, and failures/missing workflows are surfaced in the dashboard.

See [`FEATURES.md`](FEATURES.md) for the full feature breakdown.

## Getting started

Prerequisites: Node ≥24, pnpm 11+, Docker.

```sh
pnpm install             # install dependencies
cp .env.example .env     # configure environment (defaults match the dev stack)
pnpm docker:dev          # start PostgreSQL 17 on localhost:5432
pnpm db:migrate          # apply Drizzle migrations
pnpm dev                 # start the dev server
```

Environment variables (see [`.env.example`](.env.example)):

- `DATABASE_URL` (required) — PostgreSQL connection string.
- `GITHUB_API_BASE` (optional) — override the GitHub API base URL; tests point this at the fake GitHub server under `tests/fake-github/` on `http://localhost:4001`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` (optional) — OTLP/HTTP telemetry export; leave unset to disable.

## Scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `pnpm dev`             | Start the dev server                                |
| `pnpm build`           | Production build (adapter-node)                     |
| `pnpm preview`         | Preview the production build                        |
| `pnpm lint`            | ESLint + svelte-check                               |
| `pnpm fix`             | Prettier + ESLint autofix                           |
| `pnpm test:unit`       | Vitest unit/integration tests                       |
| `pnpm test:e2e`        | Playwright end-to-end tests (requires `pnpm build`) |
| `pnpm test`            | Unit tests, then end-to-end tests                   |
| `pnpm db:generate`     | Generate Drizzle migrations                         |
| `pnpm db:migrate`      | Apply Drizzle migrations                            |
| `pnpm db:studio`       | Open Drizzle Studio                                 |
| `pnpm docker:dev`      | Start the dev PostgreSQL stack                      |
| `pnpm docker:dev:down` | Stop the dev PostgreSQL stack                       |

## Testing

Unit/integration tests are colocated with source files as `src/**/*.test.{js,ts}`; end-to-end tests live in `tests/`. Run `pnpm test:e2e:setup` once to install the Playwright chromium browser. Tests never hit the real GitHub API — see [`TESTING.md`](TESTING.md) for details.

## Documentation

- [`AGENTS.md`](AGENTS.md) — agent guide and working conventions
- [`FEATURES.md`](FEATURES.md) — full feature list
- [`TESTING.md`](TESTING.md) — testing commands and layout
- [`REVIEW.md`](REVIEW.md) — code review expectations
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — topic-routed convention documents
