#!/bin/sh
# Apply pending database migrations, then exec the container command.
#
# Chains after /usr/bin/file-inject-secrets, so DATABASE_URL is already in the
# environment when this runs. Set MIGRATE_SKIP=true to bypass migrations, for
# example when debugging a container whose schema is already current.
set -eu

if [ "${MIGRATE_SKIP:-}" != "true" ]; then
    node /app/migrate.mjs
fi

if [ $# -lt 1 ]; then
    printf 'migrate-then-exec: %s\n' 'no command to exec' >&2
    exit 1
fi

exec "$@"
