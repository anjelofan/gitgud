# gitgud

A GitHub-based training program platform. Users create training programs from the GitHub orgs they own, becoming the program's first instructor; instructors import rosters from CSV and publish assignments with deadlines and GitHub Actions autograding. Students claim roster entries, join groups, and accept assignments via invitation links — everything lives in real GitHub repos, and scores flow back to the instructor dashboard via workflow webhooks and polling. Students participate as outside collaborators; org membership is managed on GitHub and is out of GitGud's scope.

## Stack

- [SvelteKit 2](https://svelte.dev/docs/kit) + [Svelte 5](https://svelte.dev/docs/svelte) (runes), TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL 17
- [pnpm](https://pnpm.io) (≥11, see `packageManager` in [`package.json`](package.json))
- [OpenTelemetry](https://opentelemetry.io) (optional OTLP/HTTP export)

## Features

- **Auth** — GitHub sign-in via a GitHub App; instructors are assigned per program, and students are outside collaborators resolved from a claimed roster entry.
- **Instructor** — create programs from GitHub orgs they own, load students from CSV with an invite/claim flow, create assignments with deadlines and autograding, lock pushes after deadlines, flag late submissions, manage/archive programs and assignments, view score dashboards and export to CSV.
- **Student** — claim a roster entry, create or join a group, accept assignments via invitation link (per-repo collaborator access for an individual or every group member).
- **Autograding** — powered by a GitHub Actions workflow already included in the template repo; scores are captured on workflow completion via webhook with polling fallback, and failures/missing workflows are surfaced in the dashboard.

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
- `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `SESSION_SECRET` (required) — GitHub app credentials
- `FAKE_GITHUB_PORT` (optional) — for testing; set this to point the tests to a fake GitHub server at `http://localhost:${FAKE_GITHUB_PORT}`.
- `GITHUB_ORG` (optional) — GitHub org used for teacher-role resolution until the classroom feature supplies org context per classroom; leave unset to resolve no role.
- `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` (optional) — OTLP/HTTP telemetry export to the local OpenObserve dev stack (see [`docs/OPENOBSERVE.md`](docs/OPENOBSERVE.md)); the untracked `.env.local` holds them, matching the credentials in `compose.observability.yml`. Leave unset to disable: in development (`NODE_ENV !== 'production'`), logger output then goes to the console instead of being discarded.

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
| `pnpm docker:obs`      | Start the OpenObserve observability stack           |
| `pnpm docker:obs:down` | Stop the OpenObserve observability stack            |

## Testing

Unit/integration tests are colocated with source files as `src/**/*.test.{js,ts}`; end-to-end tests live in `tests/`. Run `pnpm test:e2e:setup` once to install the Playwright chromium browser. Tests never hit the real GitHub API — see [`TESTING.md`](TESTING.md) for details.

## Documentation

- [`AGENTS.md`](AGENTS.md) — agent guide and working conventions
- [`TESTING.md`](TESTING.md) — testing commands and layout
- [`REVIEW.md`](REVIEW.md) — code review expectations
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — topic-routed convention documents
- [`docs/OPENOBSERVE.md`](docs/OPENOBSERVE.md) — OpenObserve dev stack for telemetry collection
