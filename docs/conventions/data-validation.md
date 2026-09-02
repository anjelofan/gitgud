# Data Validation Conventions

gitgud uses [Valibot](https://valibot.dev/) as the single source of truth for data crossing untrusted boundaries. The `valibot-best-practices` skill ([`../../.agents/skills/valibot-best-practices/SKILL.md`](../../.agents/skills/valibot-best-practices/SKILL.md)) is authoritative on schema mechanics; this document fixes the project-level rules.

## Schemas Are the Source of Truth

Every type that describes wire data (form submissions, GitHub webhook payloads, external API responses, URL parameters) MUST be derived from a Valibot schema — never hand-written alongside it:

```ts
import * as v from 'valibot';

export const AssignmentInput = v.object({
    name: v.pipe(v.string(), v.minLength(1)),
    deadline: v.pipe(v.string(), v.isoDateTime()),
});
export type AssignmentInput = v.InferOutput<typeof AssignmentInput>;
```

Dedicated `type` aliases that restate a schema's shape drift silently. If a type must be exported, export the schema and derive the alias from it.

## Parse at Every Untrusted Boundary

Validate with `v.parse` (or `v.safeParse` when failure is an expected, recoverable outcome) exactly where data enters the trust boundary:

- Form action handlers parsing `formData`
- GitHub webhook request bodies
- Responses from external HTTP APIs (including the GitHub API client)
- Anything read from the environment that is not a plain string

Inside the boundary, trust the parsed types; do not re-validate the same data at every layer.

## Failure Handling

- Expected, user-facing failures (form input): use `v.safeParse` and return a structured failure result; log `fatal` at the termination boundary per [`open-telemetry.md`](./open-telemetry.md).
- Unexpected failures (a webhook payload that violates the contract): let `v.parse` throw; the error path logs and surfaces it.
