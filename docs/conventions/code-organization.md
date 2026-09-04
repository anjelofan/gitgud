# Code Organization Conventions

This document fixes the project-level rules for file language, directory layout, and component prop typing. Library-level mechanics are covered by the agent skills; the `vertically-sliced-feature-modules` skill ([`../../.agents/skills/vertically-sliced-feature-modules/SKILL.md`](../../.agents/skills/vertically-sliced-feature-modules/SKILL.md)) is authoritative on feature ownership and import direction, and the `typescript-best-practices` skill is authoritative on type contracts.

## JavaScript by Default

Use JavaScript (`.js` / `lang="js"`) by default. Only use TypeScript (`.ts` / `lang="ts"`) when syntax requires it (e.g., type annotations, generics, interfaces).

## Directory Layout

- **Feature modules** live in `$lib/features/<feature>/`. Cohesion, public entry points, and import direction follow the `vertically-sliced-feature-modules` skill: features never import sibling features' internals, and orchestrators import feature entries, not implementation leaves.
- **Project-wide UI components** live in `$lib/ui/`. These are presentational building blocks shared across features: no feature logic, no feature imports, no server imports.
- Behavior needed by multiple features is promoted to an explicit shared module with an owner — not hosted in whichever feature needed it first (see the skill's `shared-code-promotion.md`).

## Server-only Placement

Some code must never be bundled for the client — secrets, credentials, session and token handling, or server-side infrastructure shared across features. SvelteKit enforces client-exclusion for exactly two placements; code that must stay server-side belongs in one of them, because nothing else is guaranteed:

- **Shared, cross-feature server-only modules** live in `$lib/server/`. Server-side infrastructure that multiple features consume belongs here — including anything that handles secrets or governs authentication, so the boundary is enforced by location and reviewable at a glance.
- **Feature-local server-only modules** live inside their feature using the `.server.ts` / `.server.js` file suffix, which SvelteKit enforces identically anywhere in the tree.

Server-only code placed under any other name or path is unprotected: a client import will bundle silently. Features never import other features' internals; shared server-side behavior is promoted to `$lib/server/` with an owner (see `vertically-sliced-feature-modules`).

## Route Layout

Route files map directly to URLs, so the tree's shape is the URL contract:

- **Browser-facing flows** (sign-in, callbacks, any sequence of redirects that ends in user interaction) use semantic URLs such as `/auth/…`. They are user-visible and frequently registered with external services; renaming one is a breaking change to that contract.
- **Machine-facing endpoints** (webhooks, integration APIs) live under `/api/…`.
- Endpoint-only routes are not interleaved with page routes for the same resource; if a URL needs both a page and an endpoint, colocate `+page` and `+server` in the same directory and let content negotiation decide.

## Component Props Are Database Slices

Type component props as narrow `Pick`s of the Drizzle schema types instead of inlining object shapes that restate column definitions:

```svelte
<script lang="ts" module>
    import type { schema } from '$lib/server/db';

    export interface Props {
        user: Pick<schema.User, 'id' | 'login' | 'avatarUrl'>;
        sessions: Pick<schema.Session, 'id' | 'expiresAt'>[];
    }
</script>
```

Rules:

- Always `import type`. `$lib/server/*` is server-only at runtime; a type-only import is erased before SvelteKit's boundary check and keeps the component client-safe. A runtime import of `$lib/server/db` from component code is a bug.
- Slice with `Pick` to the fields the component actually renders; never pass a whole row type when a slice suffices.
- The capitalized row types (`schema.User`, `schema.Session`, `schema.GithubTokens`) are defined in [`src/lib/server/db/schema/auth.ts`](../../src/lib/server/db/schema/auth.ts). Add a new alias there when a new table needs component props — do not restate the shape in the component.
