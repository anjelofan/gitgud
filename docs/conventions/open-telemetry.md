# OpenTelemetry Conventions

gitgud emits traces and logs through the `Logger` and `Tracer` classes in `$lib/server/telemetry/` (see [`logger.ts`](../../src/lib/server/telemetry/logger.ts) and [`tracer.ts`](../../src/lib/server/telemetry/tracer.ts)). `console.*` is lint-warned; `logger.*` is the project's output channel.

## Dev Output

Log records are exported via OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. When it is unset and `NODE_ENV !== 'production'`, [`src/instrumentation.server.js`](../../src/instrumentation.server.js) attaches a console exporter instead, so `logger.*` output is visible in the development terminal. Production without an OTLP endpoint stays silent by contract; spans are only ever exported via OTLP.

## Service Naming

Use hierarchical dot-separated names: `module.submodule.service`.

Examples:

- `hooks` — request lifecycle (as in `hooks.server.ts`)
- `routes.dashboard.classroom` — a route module
- `database.classroom` — database access for classrooms

## Logger & Tracer Instantiation

Every module that needs logging/tracing declares both at module level:

```ts
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.dashboard.classroom';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);
```

## Logger Usage

Message first, then optional attributes object:

```ts
logger.trace('detailed debug info', { key: 'value' });
logger.debug('debug info', { key: 'value' });
logger.info('informational', { key: 'value' });
logger.warn('warning message', { key: 'value' });
logger.error('handled internal error', error, { key: 'value' });
logger.fatal('request terminates with failure', error, { key: 'value' });
```

Signature patterns:

- `trace/debug/info/warn(body: string, attributes?)`
- `error/fatal(body: string, error?, attributes?)` — pass `void 0` when there is no exception.

### Log Levels

- `trace` — very detailed, high-volume debugging
- `debug` — developer debugging info
- `info` — normal operations (request started, completed)
- `warn` — unexpected but recoverable; request processing continues
- `error` — handled internal errors that need attention, but the request does not terminate at this log site
- `fatal` — failure-style request termination at the boundary where the error becomes user-facing

Severity is chosen by where the error is logged in the request lifecycle, not by whether the final status code is `4xx` or `5xx`.

### Request-Terminating Failures MUST Log `fatal`

Use `logger.fatal(...)` immediately before `error(...)`, `return fail(...)`, or any equivalent failure-style request termination.

- Apply this rule to expected user-facing failures too, including validation, permission, conflict, and not-found responses.
- Do not treat an earlier internal `warn` or `error` log as a substitute for the boundary `fatal`.
- Internal handled failures use `warn` or `error` when request processing continues or recovers.

```ts
// Internal handled error: request continues, so not fatal.
try {
    value = parseInput(payload);
} catch (error) {
    logger.error('failed to parse input, using fallback', error);
    value = fallbackValue;
}
return { value };
```

```ts
// Boundary validation failure: request terminates here, so fatal.
import { fail } from '@sveltejs/kit';

if (!result.success) {
    logger.fatal('invalid assignment form input', result.error, {
        'user.id': locals.user.id,
    });
    return fail(422, { message: 'Invalid assignment input.' });
}
```

```ts
// Boundary permission failure: request terminates here, so fatal.
import { error } from '@sveltejs/kit';

if (!locals.user.isTeacher) {
    logger.fatal('insufficient permissions to access classroom', void 0, {
        'user.id': locals.user.id,
        'user.is_teacher': locals.user.isTeacher,
    });
    error(403);
}
```

### Redirects

Redirects terminate the request but are not failure-style terminators. Do not use `fatal` for redirects. When a redirect is worth logging, use `error` or lower:

```ts
if (session === null) {
    logger.error('missing session, redirecting to login');
    redirect(303, '/login');
}
```

## Span Wrapping

Use `kebab-case` for span names. `Tracer.span` wraps synchronous operations; `Tracer.asyncSpan` wraps asynchronous ones:

```ts
return tracer.asyncSpan('list-assignments', async (span) => {
    span.setAttribute('classroom.id', classroomId);
    // ...
});
```

## Attribute Naming

Use a dot-separated namespace with `snake_case` property names: `namespace.resource.property`.

| Prefix         | Context                               |
| -------------- | ------------------------------------- |
| `http.*`       | HTTP request/response metadata        |
| `network.*`    | Client network information            |
| `session.*`    | Authenticated request context (spans) |
| `user.*`       | User entity (log attributes)          |
| `classroom.*`  | Classroom entity                      |
| `assignment.*` | Assignment entity                     |
| `submission.*` | Submission entity                     |
| `github.*`     | GitHub API interaction context        |
| `database.*`   | Database query context                |

### Attribute Guidelines

- Use `span.setAttributes({ ... })` to bulk-set multiple non-nullable attributes.
- Use `span.setAttribute(key, value)` for single attributes.
- Conditionally set nullable values; never pass `null` as an attribute value.
- Capture all closure inputs at the start of each span:

```ts
return tracer.asyncSpan('load-assignment-dashboard', async (span) => {
    span.setAttributes({
        'session.id': sessionId,
        'user.id': userId,
        'user.is_teacher': isTeacher,
    });

    if (assignmentId !== null) span.setAttribute('assignment.id', assignmentId);
    // ...
});
```

## Request Context

Request-scoped context propagates via OpenTelemetry trace context. The root span in `hooks.server.ts` sets request attributes; child spans inherit them via trace propagation. There is no need for `logger.child()` — span attributes handle context.
