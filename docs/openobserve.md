# OpenObserve Dev Stack

Self-hosted [OpenObserve](https://openobserve.ai/) observability stack for local development: OTLP/HTTP traces and logs exported by the app (via `src/instrumentation.server.js`) land in an OpenObserve instance running in Docker Compose.

The stack is a standalone Compose project (`compose.observability.yml`, project `gitgud-obs`) so `pnpm docker:dev:down --remove-orphans` never touches it.

## Quickstart

```sh
pnpm docker:obs:setup   # one-time: scaffold untracked local secrets + .env.local
pnpm docker:obs         # start the stack (waits for health)
```

Then:

1. Open the UI at <http://localhost:5080> and log in with `root@example.com` / `DevOnlyPassword1!` (the dev root credentials; org is `default`).
2. Sanity-check the API: `curl -fsS http://localhost:5080/healthz`.
3. Start (or restart) the app: `pnpm dev`. The generated `.env.local` already carries the OTLP endpoint and `Authorization` header, so Vite loads them automatically and `src/instrumentation.server.js` exports traces/logs to the `default` org.
4. Browse traces/logs in the OpenObserve UI.
5. Stop the stack when done: `pnpm docker:obs:down`.

Repeat `pnpm docker:obs` / `pnpm docker:obs:down` freely — state lives in the `openobserve-data` volume, and re-running `pnpm docker:obs:setup` is a no-op that never overwrites edited files (`cp -n`, `test -f`).

## Secrets model

OpenObserve's image does not support `*_FILE` secret injection (see [openobserve/openobserve#5205](https://github.com/openobserve/openobserve/issues/5205)), and credentials must never appear in tracked files, so the Compose file injects secrets the standard way and bridges them at container start:

- `openobserve/secrets/dev/root_user_email` and `openobserve/secrets/dev/root_user_password` hold the values. Committed templates (`*.example`) mirror the dev defaults; the real files are git-ignored and created by `pnpm docker:obs:setup`.
- `compose.observability.yml` declares Compose secrets reading those files and mounts them at `/run/secrets/`.
- The container's entrypoint (`/bin/sh -c` wrapper) `export`s `ZO_ROOT_USER_EMAIL`/`ZO_ROOT_USER_PASSWORD` from the mounted files, then `exec /openobserve`. No credential appears in any `environment:` block.
- Local edits to a secret file only apply on the next container start: edit the file, then `pnpm docker:obs:down && pnpm docker:obs`.

The dev password must satisfy OpenObserve's startup validation: 8–128 characters with at least one lowercase letter, one uppercase letter, one digit, and one special character — otherwise OpenObserve panics on boot with a password-strength error. `DevOnlyPassword1!` complies.

### Custom secret location

`OPENOBSERVE_SECRETS_DIR` overrides the default secret directory (`.env`-style interpolation, default `./openobserve/secrets/dev`). Point it at another directory holding `root_user_email`/`root_user_password` when you want credentials outside the repo tree:

```sh
OPENOBSERVE_SECRETS_DIR=/path/to/secrets pnpm docker:obs
```

## Server deployment

Deferred / planned — no runbook yet. When production observability is tackled, this section will cover the server-side OpenObserve deployment (hosting, TLS, auth, retention, upgrades) and how the app's OTLP endpoint/header configuration is supplied per environment without committing secrets. Local development is unaffected by this decision.
