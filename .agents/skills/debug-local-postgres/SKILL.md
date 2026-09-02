---
name: debug-local-postgres
description: >
  MUST be used whenever the agent needs to query, inspect, or debug values from the local
  PostgreSQL database. This includes checking classroom, assignment, submission, or user
  data, or any other database-stored information.
---

# Debug Local PostgreSQL

Query and inspect the local PostgreSQL database (provided by `pnpm docker:dev`, see [`compose.dev.yml`](../../../compose.dev.yml)) for debugging.

**IMPORTANT:** All queries MUST be read-only (`SELECT` statements only). Do NOT execute `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, or any other data-modifying statement unless the user EXPLICITLY requests a write operation.

## Prerequisites

Before writing queries, read the schema files under `src/lib/server/db/schema/` to understand table structures.

## Connection

```bash
docker compose -f compose.yml -f compose.dev.yml exec postgres psql -U postgres
```

## SQL Scripts

Pre-written read-only queries for common debugging scenarios:

| Script                                  | Use Case                                    |
| --------------------------------------- | ------------------------------------------- |
| [list-tables.sql](scripts/list-tables.sql)       | List all user tables across schemas         |
| [table-rows.sql](scripts/table-rows.sql)         | Sample rows from a table                    |
| [active-sessions.sql](scripts/active-sessions.sql) | Inspect active connections and running queries |
| [db-size.sql](scripts/db-size.sql)               | Database and per-table disk usage           |

## SQL Conventions

- Replace `$placeholder$` tokens in scripts with actual values.
- Always schema-qualify table names when the schema is known (e.g. `public.classroom`).
- Add `LIMIT` to exploratory queries on unindexed or growing tables.
