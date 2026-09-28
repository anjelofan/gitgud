#!/bin/sh
set -e

# Create Docker Swarm secrets from secrets/<name>.txt files.
# Each file must contain exactly the secret value: one line, no leading
# or trailing whitespace, no trailing newline. Files are gitignored.

SECRET_DIR="${1:-secrets}"

for name in gitgud_db_user gitgud_db_password gitgud_db_name gitgud_db_url \
    gitgud_github_app_client_id gitgud_github_app_client_secret \
    gitgud_github_app_private_key gitgud_session_secret; do
    file="$SECRET_DIR/$name.txt"
    if [ ! -f "$file" ]; then
        echo "skip: missing $file"
        continue
    fi
    if docker secret inspect "$name" >/dev/null 2>&1; then
        echo "skip: $name already exists"
        continue
    fi
    cat "$file" | docker secret create "$name" -
done

echo "done: once all secrets exist, delete $SECRET_DIR/"