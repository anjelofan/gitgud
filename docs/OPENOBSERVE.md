# OpenObserve Dev Stack

Self-hosted [OpenObserve](https://openobserve.ai/) observability stack for local development: OTLP/HTTP traces and logs exported by the app (via `src/instrumentation.server.js`) land in an OpenObserve instance running in Docker Compose.

The stack is a standalone Compose project (`compose.observability.yml`, project `gitgud-obs`) so `pnpm docker:dev:down --remove-orphans` never touches it.

## Quickstart

```sh
pnpm docker:obs         # start the stack (waits for the container to start)
```

Then:

1. Open the UI at <http://localhost:5080> and log in with the dev credentials set in `compose.observability.yml` (org is `default`).
2. Sanity-check the API: `curl -fsS http://localhost:5080/healthz`.
3. Start (or restart) the app: `pnpm dev`. The untracked `.env.local` holds the OTLP endpoint and `Authorization` header matching those credentials, so Vite loads them automatically and `src/instrumentation.server.js` exports traces/logs to the `default` org.
4. Browse traces/logs in the OpenObserve UI.
5. Stop the stack when done: `pnpm docker:obs:down`.

Repeat `pnpm docker:obs` / `pnpm docker:obs:down` freely — state lives in the `openobserve-data` volume.

## Credentials

OpenObserve's image ships only the server binary (no shell, no utilities) and the server has no `*_FILE` support (see [openobserve/openobserve#5205](https://github.com/openobserve/openobserve/issues/5205)), so credentials must arrive as environment variables; a mounted file cannot be named by one. For development, `compose.observability.yml` sets them directly on the service:

- The dev credentials are committed in `compose.observability.yml`. They belong to a localhost-bound stack (`host_ip: 127.0.0.1`) and are not secret material.
- The root user is created on the first boot of a fresh `openobserve-data` volume; later boots read the stored user and ignore the environment. Changing the credentials in the file therefore has no effect until the volume is recreated: `pnpm docker:obs:down`, `docker volume rm gitgud-obs_openobserve-data`, then `pnpm docker:obs`.
- The credentials reach the server through the container environment and are visible to `docker inspect` — acceptable for a localhost-bound dev stack.
- Without them the server exits instead of booting, failing with `Please set root user email-id & password using ZO_ROOT_USER_EMAIL & ZO_ROOT_USER_PASSWORD`; there is no default-credential fallback.
- The password must satisfy OpenObserve's startup validation: 8–128 characters with at least one lowercase letter, one uppercase letter, one digit, and one special character — otherwise OpenObserve panics on boot with a password-strength error.

### App wiring

The app authenticates with the same credentials through an OTLP header. `.env.local` is untracked and holds:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5080/api/default
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(root_email:root_password)>
```

After changing the credentials in `compose.observability.yml`, re-derive the header to keep both sides in sync:

```sh
printf '%s' 'admin@example.com:AdminPassword1!' | base64
```

## Operational notes

There is no container healthcheck: the image has no shell or utilities (no `curl`) to run one with, so `pnpm docker:obs` waits for the container to start rather than for a health status. Use the host-side `curl` from the quickstart to confirm readiness.

## Server deployment

Deferred / planned — no runbook yet. When production observability is tackled, this section will cover the server-side OpenObserve deployment (hosting, TLS, auth, retention, upgrades) and how the app's OTLP endpoint/header configuration is supplied per environment without committing secrets. Local development is unaffected by this decision.

One option for that work, verified against v0.91.0: the server reads a mounted dotenv file through its `--config <path>` flag (`command: ['/openobserve', '--config', '/run/secrets/oo_config']`), which keeps the root credentials out of the container environment (`docker inspect`, `/proc/1/environ`). Its dotenv escaping differs from Compose's — a literal `$` is `\$` there, not `$$`.
