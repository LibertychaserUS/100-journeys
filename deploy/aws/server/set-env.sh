#!/usr/bin/env bash
# Set one variable in the service EnvironmentFile, reading the value from stdin so it
# never appears in process arguments or logs. Takes effect on the next service restart.
#
# Usage (as root): printf '%s' "$value" | set-env.sh <NAME>
set -euo pipefail

ENV_FILE=/etc/100-journeys/100-journeys.env
name="${1:?usage: set-env.sh <NAME> (value on stdin)}"
[[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "invalid variable name: $name" >&2; exit 2; }

value="$(cat)"
# systemd EnvironmentFile treats quotes, backslashes and whitespace specially; API keys never need them.
if [ -z "$value" ] || ! [[ "$value" =~ ^[A-Za-z0-9._~+/=:-]+$ ]]; then
  echo "refusing to set $name: value is empty or has unsupported characters" >&2
  exit 2
fi

umask 077
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
grep -v "^$name=" "$ENV_FILE" >"$tmp" || true
printf '%s=%s\n' "$name" "$value" >>"$tmp"
if cmp -s "$tmp" "$ENV_FILE"; then
  echo "$name unchanged"
else
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  echo "$name updated in $ENV_FILE"
fi
