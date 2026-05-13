#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy/sync-tencent.sh <host> <ssh-key-path> [user] [remote-dir]

Example:
  scripts/deploy/sync-tencent.sh 49.232.207.220 /path/to/private-key root /opt/100-journeys/app

Notes:
  - The private key path is passed at runtime and is never written to this repo.
  - The payload is controlled by deploy/tencentcloud.rsync-filter.
  - Only deployment-required source/config/static files are uploaded.
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "$#" -lt 2 ]; then
  usage
  exit 0
fi

HOST="$1"
SSH_KEY="$2"
USER="${3:-root}"
REMOTE_DIR="${4:-/opt/100-journeys/app}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILTER_FILE="$ROOT_DIR/deploy/tencentcloud.rsync-filter"

if [ ! -f "$FILTER_FILE" ]; then
  echo "Missing rsync filter: $FILTER_FILE" >&2
  exit 2
fi

chmod 600 "$SSH_KEY"

SSH_OPTS=(
  -i "$SSH_KEY"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
)

REMOTE_DIR_Q="$(printf '%q' "$REMOTE_DIR")"

ssh "${SSH_OPTS[@]}" "$USER@$HOST" "mkdir -p $REMOTE_DIR_Q"

rsync -az --delete --delete-excluded \
  --filter="merge $FILTER_FILE" \
  -e "ssh -i '$SSH_KEY' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  "$ROOT_DIR"/ "$USER@$HOST:$REMOTE_DIR"/

ssh "${SSH_OPTS[@]}" "$USER@$HOST" "cd $REMOTE_DIR_Q && find . -maxdepth 2 -type f | sed 's#^\./##' | sort"
