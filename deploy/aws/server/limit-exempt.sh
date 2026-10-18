#!/usr/bin/env bash
# Temporarily exempt an operator IP from Nginx rate limits (e.g. for a Playwright run).
# Usage (as root): limit-exempt.sh add <ip/cidr> | clear | show
set -euo pipefail

FILE=/etc/nginx/100-journeys-limit-exempt.conf
case "${1:-show}" in
  add)
    cidr="${2:?usage: limit-exempt.sh add <ip/cidr>}"
    [[ "$cidr" =~ ^[0-9a-fA-F:.]+(/[0-9]+)?$ ]] || { echo "invalid address: $cidr" >&2; exit 2; }
    grep -qxF "$cidr 1;" "$FILE" || echo "$cidr 1;" >>"$FILE"
    ;;
  clear) : >"$FILE" ;;
  show) cat "$FILE"; exit 0 ;;
  *) echo "usage: limit-exempt.sh add <ip/cidr> | clear | show" >&2; exit 2 ;;
esac
nginx -t -q && systemctl reload nginx
echo "rate-limit exemptions: $(wc -l <"$FILE")"
