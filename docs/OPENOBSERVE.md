# OpenObserve Dev Stack

Self-hosted [OpenObserve](https://openobserve.ai/) observability stack for local development: OTLP/HTTP traces and logs exported by the app (via `src/instrumentation.server.js`) land in an OpenObserve instance running in Docker Compose.

The stack is a standalone Compose project (`compose.observability.yml`, project `gitgud-obs`) so `pnpm docker:dev:down --remove-orphans` never touches it.

## Quickstart

```sh
pnpm docker:obs:setup   # one-time: scaffold untracked local secrets + .env.local
pnpm docker:obs         # start the stack (waits for the container to start)
```

Then:

1. Open the UI at <http://localhost:5080> and log in with the dev admin credentials (`openobserve/secrets/dev/admin_email` / `admin_password`; defaults `admin@example.com` / `AdminPassword1!`; org is `default`).
2. Sanity-check the API: `curl -fsS http://localhost:5080/healthz`.
3. Start (or restart) the app: `pnpm dev`. `pnpm docker:obs:setup` derives the OTLP endpoint and `Authorization` header from the credential files into `.env.local`, so Vite loads them automatically and `src/instrumentation.server.js` exports traces/logs to the `default` org.
4. Browse traces/logs in the OpenObserve UI.
5. Stop the stack when done: `pnpm docker:obs:down`.

Repeat `pnpm docker:obs` / `pnpm docker:obs:down` freely — state lives in the `openobserve-data` volume. Re-running `pnpm docker:obs:setup` never overwrites the credential files (`cp -n`) and preserves unrelated `.env` / `.env.local` lines; it refreshes only the derived artifacts (the two `ZO_ROOT_USER_*` lines in `.env` and the two OTLP lines in `.env.local`).

## Secrets model

OpenObserve's image ships only the server binary (no shell, no utilities) and the server has no `*_FILE` support (see [openobserve/openobserve#5205](https://github.com/openobserve/openobserve/issues/5205)), so a mounted file cannot be named by an environment variable. Compose therefore passes the credentials as environment variables, which `pnpm docker:obs:setup` derives into `.env` for the service to pass through:

- `openobserve/secrets/dev/admin_email` and `openobserve/secrets/dev/admin_password` hold the values. Committed templates (`*.example`) mirror the dev defaults; the real files are git-ignored and created by `pnpm docker:obs:setup`.
- `pnpm docker:obs:setup` derives `ZO_ROOT_USER_EMAIL`/`ZO_ROOT_USER_PASSWORD` into the project's `.env`, and `compose.observability.yml` passes them into the container (`environment: ZO_ROOT_USER_EMAIL:`); Compose resolves those values from `.env` or the shell, the shell winning. `.env` is git-ignored — edit the credential files, never the derived lines.
- Without a value in either place the variable is dropped from the container, and the server fails to boot with `Please set root user email-id & password using ZO_ROOT_USER_EMAIL & ZO_ROOT_USER_PASSWORD`; it does not fall back to default credentials.
- The credentials therefore reach the server through the container environment and are visible to `docker inspect` — acceptable for a localhost-bound dev stack.
- `pnpm docker:obs:setup` also derives `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(admin_email:admin_password)>` into `.env.local`, so the app exports with the same credentials and no header value is ever committed.
- Local edits to a credential file only apply after `pnpm docker:obs:setup` re-derives the artifacts and the container restarts: edit the file, run `pnpm docker:obs:setup`, then `pnpm docker:obs:down && pnpm docker:obs`.
- There is no container healthcheck: the image has no shell or utilities (no `curl`) to run one with, so `pnpm docker:obs` waits for the container to start rather than for a health status. Use the host-side `curl` from the quickstart to confirm readiness.

The dev password must satisfy OpenObserve's startup validation: 8–128 characters with at least one lowercase letter, one uppercase letter, one digit, and one special character — otherwise OpenObserve panics on boot with a password-strength error. `DevOnlyPassword1!` complies, and `pnpm docker:obs:setup` enforces the same policy up front.

### Custom secret location

`OPENOBSERVE_SECRETS_DIR` overrides the default secret directory (default `./openobserve/secrets/dev`) for `pnpm docker:obs:setup`; a shell-exported value wins over `.env`. Point it at another directory holding `admin_email`/`admin_password` when you want credentials outside the repo tree — the derived `.env` lines follow the directory's contents:

```sh
OPENOBSERVE_SECRETS_DIR=/path/to/secrets pnpm docker:obs:setup
pnpm docker:obs
```

## Server deployment

Deferred / planned — no runbook yet. When production observability is tackled, this section will cover the server-side OpenObserve deployment (hosting, TLS, auth, retention, upgrades) and how the app's OTLP endpoint/header configuration is supplied per environment without committing secrets. Local development is unaffected by this decision.

One option for that work, verified against v0.91.0: the server reads a mounted dotenv file through its `--config <path>` flag (`command: ['/openobserve', '--config', '/run/secrets/oo_config']`), which keeps the root credentials out of the container environment (`docker inspect`, `/proc/1/environ`). Its dotenv escaping differs from Compose's — a literal `$` is `\$` there, not `$$`.
