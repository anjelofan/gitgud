#!/bin/sh
# Inject secrets from files into the environment, then exec CMD.
# Usage: file-inject-secrets <cmd> [args...]
#
# FILE_INJECTED_SECRETS: comma-separated env names.
# For each NAME: if NAME is unset or empty and NAME_FILE is set to a
# readable path, load the file's trimmed contents into NAME. NAME_FILE
# is always unset afterward.

warn() {
    printf 'file-inject-secrets: %s\n' "$*" >&2
}

trim() {
    word=$1
    word=${word#"${word%%[![:space:]]*}"}
    word=${word%"${word##*[![:space:]]}"}
    printf '%s' "$word"
}

if [ -n "${FILE_INJECTED_SECRETS:-}" ]; then
    set -f
    old_ifs=$IFS
    IFS=,
    for unparsed_key in $FILE_INJECTED_SECRETS; do
        key=$(trim "$unparsed_key")
        if [ -z "$key" ]; then
            continue
        fi

        case $key in
            *[!A-Za-z0-9_]* | [0-9]*)
                warn "msg=\"Invalid env name\" key=\"$key\""
                continue
                ;;
        esac

        file_key="${key}_FILE"
        use_file=1

        # Set value from file only when KEY is unset or empty.
        eval "value_set=\${$key+x}"
        if [ -n "$value_set" ]; then
            eval "value=\${$key}"
            if [ -n "$(trim "$value")" ]; then
                use_file=
            fi
        fi

        if [ -n "$use_file" ]; then
            eval "file_set=\${$file_key+x}"
            if [ -n "$file_set" ]; then
                eval "file_path=\${$file_key}"
                file_path=$(trim "$file_path")
                if [ -n "$file_path" ]; then
                    if secret=$(cat "$file_path"); then
                        secret=$(trim "$secret")
                        if [ -n "$secret" ]; then
                            export "$key=$secret"
                        fi
                    else
                        warn "msg=\"Failed to read file\" key=\"$key\" file=\"$file_path\" message=\"cat $file_path: no such file or permission denied\""
                    fi
                fi
            fi
        fi

        if ! unset "$file_key" 2>/dev/null; then
            warn "msg=\"Failed to unset env\" env=\"$file_key\""
        fi
    done
    IFS=$old_ifs
    set +f
fi

if [ $# -lt 1 ]; then
    warn "msg=\"No command to exec\" usage=\"file-inject-secrets <cmd> [args...]\""
    exit 1
fi

cmd=$(command -v "$1")
if [ -z "$cmd" ]; then
    warn "msg=\"Failed to find CMD executable\" cmd=\"$1\""
    exit 1
fi

exec "$@"