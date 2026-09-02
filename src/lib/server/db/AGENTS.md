# Database

Conventions for `$lib/server/db` and the Drizzle schema. The `drizzle-orm-best-practices` skill ([`../../../../.agents/skills/drizzle-orm-best-practices/SKILL.md`](../../../../.agents/skills/drizzle-orm-best-practices/SKILL.md)) is authoritative on dialect-level query and transaction rules; this file covers the project layout and workflow.

## Layout

- Schema files live in `src/lib/server/db/schema/` (the `schema` entry of [`../../../../drizzle.config.js`](../../../../drizzle.config.js)); `schema/index.js` re-exports them.
- Generated migrations land in `drizzle/` and are append-only.
- The app imports the singleton `db` from [`./index.ts`](./index.ts); never construct new `Pool`s or `drizzle` instances elsewhere.

## Migration Workflow

1. Edit the schema files in `src/lib/server/db/schema/`.
2. Generate a migration: `pnpm db:generate <name>`, where `<name>` is a short kebab-case description of the schema change (e.g. `add-auth-tables`). The `db:generate` script appends the name to drizzle-kit's `--name` flag and fails when it is omitted, so every migration file carries a human-readable description instead of a random codename.
3. Review the generated SQL in `drizzle/` before applying it. Never hand-edit generated migration files.
4. Apply migrations: `pnpm db:migrate` (requires `DATABASE_URL`; see [`.env.example`](../../../../.env.example)).
5. Inspect visually when needed: `pnpm db:studio`.

## Debugging

Use the `debug-local-postgres` skill ([`../../../../.agents/skills/debug-local-postgres/SKILL.md`](../../../../.agents/skills/debug-local-postgres/SKILL.md)) to inspect the local database. All queries through it MUST be read-only unless the user explicitly requests a write.
