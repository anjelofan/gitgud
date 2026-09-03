# Type Annotation Conventions

This document extends the `typescript-best-practices` skill ([`../../.agents/skills/typescript-best-practices/SKILL.md`](../../.agents/skills/typescript-best-practices/SKILL.md)) and closes the gaps in its [`inference-over-annotation`](../../.agents/skills/typescript-best-practices/references/inference-over-annotation.md) reference that project experience has shown are easy to misapply. The skill remains authoritative on type contracts generally; where the reference is silent, this document governs.

## Return Types Are Inferred, With Narrow Exceptions

Never annotate a return type that the function body makes obvious. This is not limited to domain-typed returns — it explicitly includes the most common cases:

```typescript
// BAD: `void` and async returns are inferable like any other.
registerUser({ token, user }): void {
    this.#users.set(token, user);
}

async listen(port = 4001): Promise<number> {
    // ...
    return port;
}

// GOOD: infer them.
registerUser({ token, user }) {
    this.#users.set(token, user);
}

async listen(port = 4001) {
    // ...
    return port;
}
```

Annotate a return type only when inference lacks information required by the program:

- the body hands back an untyped boundary value (`JSON.parse`, external `any`/`unknown`) and the annotation is the trust boundary that converts it into a contract;
- inference would widen or collapse a type that callers genuinely need narrowed (e.g. an inference gap that yields `never` or `{}`).

Everything else stays inferred. Parameter annotations are always required on function declarations — inference does not apply to parameters.

## Migrating JavaScript to TypeScript

JavaScript files in this project carry no type annotations, so a migration only adds them:

- add parameter annotations to every function declaration — inference does not apply to parameters;
- apply the return-type rule above: annotate only boundary returns (untyped values from untrusted sources), leave everything else inferred;
- give top-level constants that lost their context the narrow annotations they need (e.g. empty collections, nullable fields).

## Boundary Contracts Are the Exception

A return contract that narrows an untyped value coming from an untrusted source — an HTTP response body, the environment, an external module returning `any` — is legitimate and stays: inference cannot produce that contract, so the annotation is the trust boundary itself, not a restatement.

## Enforcement

No lint rule currently flags derivable return annotations. Until one exists, the enforcement is deliberate: when generating or converting annotated code, re-read the `inference-over-annotation` reference and this document, and treat the full gate battery (`pnpm lint` including `lint:sv`) as the completion check.
