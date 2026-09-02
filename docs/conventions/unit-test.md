# Unit / Integration Test Conventions

Conventions for the colocated Vitest suite (`src/**/*.test.{js,ts}`, run in the node environment; configured in the `test` block of [`../../vite.config.js`](../../vite.config.js)). Commands live in [`../../TESTING.md`](../../TESTING.md); the `testing-guidelines` skill ([`../../.agents/skills/testing-guidelines/SKILL.md`](../../.agents/skills/testing-guidelines/SKILL.md)) governs test admission — whether a test should exist at all.

## Placement

- Test files are colocated with the source they verify: `src/lib/server/db/foo.ts` → `src/lib/server/db/foo.test.ts`.
- Tests run in the node environment; do not rely on browser APIs. Component-level behavior that needs a browser belongs in the end-to-end suite (see [`tests/AGENTS.md`](../../tests/AGENTS.md)).

## Boundaries

- Tests must never hit the real GitHub API. The GitHub client reads its base URL from `GITHUB_API_BASE`; point it at the fake GitHub server under `tests/fake-github/` (or a test double) instead.
- The `vite.config.js` test configuration excludes `tests/**` — do not place unit tests there.

## Running

- `pnpm test:unit` runs the whole suite; it is the unit half of `pnpm test`.
- Every test must contain at least one assertion — enforced by `requireAssertions: true` in the `vite.config.js` test configuration; assertion-free tests fail.
- Machine-readable results are written to `vitest-results/` (gitignored; never commit them).
