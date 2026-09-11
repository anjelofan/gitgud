# Project Conventions

This file routes to the project-specific convention documents. Generic library conventions (TypeScript, Svelte, Valibot, Drizzle, OpenTelemetry mechanics) are covered by the agent skills in [`.agents/skills/`](../.agents/skills/); do not duplicate them here.

## Enforced by Tooling

Style conventions are machine-enforced by [`eslint.config.js`](../eslint.config.js) and Prettier. Treat `pnpm lint` and `pnpm fmt` failures as MUSTs. Never disable a rule ad hoc to make code pass; if a rule is genuinely wrong for the project, propose changing the config instead.

The ESLint configuration is itself a convention document: read it before generating or modifying source files, and write new code _against_ its rules rather than fixing violations afterwards. Many of its rules diverge from common ecosystem style (`require-unicode-regexp`, `no-undefined`, `curly: multi`, `no-negated-condition`, `func-style: declaration`) — do not rely on prior habits. Import ordering (`imsort`) is not derivable by hand: finish every new or modified file with `pnpm es:fix` followed by `pnpm lint:es`, not a task-end cleanup.

## Topic Documents

Read the topic document that applies to the current task before writing code.

- [`conventions/code-organization.md`](./conventions/code-organization.md) — required when creating any source file (JS-by-default rule, `$lib` layout, component prop typing).
- [`conventions/open-telemetry.md`](./conventions/open-telemetry.md) — required for route files (`load` functions, form actions, `hooks.server.ts`) and server modules.
- [`conventions/data-validation.md`](./conventions/data-validation.md) — required at every untrusted boundary (form submissions, GitHub webhooks, external API responses).
- [`conventions/unit-test.md`](./conventions/unit-test.md) — required when writing colocated unit/integration tests (`src/**/*.test.{js,ts}`).

## Colocated Conventions

Some conventions live next to the code they govern:

- [`src/lib/server/db/AGENTS.md`](../src/lib/server/db/AGENTS.md) — database schema and migration workflow.
- [`tests/AGENTS.md`](../tests/AGENTS.md) — end-to-end test rules and the fake-GitHub boundary.
