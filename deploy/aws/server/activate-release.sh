#!/usr/bin/env bash
# Switch /opt/100-journeys/current to a release, restart the API and health-check it.
# If the new release fails its health check, the previous release is restored.
#
# Usage (as root):
#   activate-release.sh <release-id>     activate an uploaded release
#   activate-release.sh --previous       roll back to the release before the current one
#   activate-release.sh --list           list releases (* marks current)
set -euo pipefail

BASE=/opt/100-journeys
RELEASES="$BASE/releases"
DB_PATH=/var/lib/100-journeys/app.db
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_URL=http://127.0.0.1:8080/api/health

current="$(basename "$(readlink "$BASE/current" 2>/dev/null || echo none)")"

if [ "${1:-}" = "--list" ]; then
  for r in $(ls -1 "$RELEASES" | sort); do
    if [ "$r" = "$current" ]; then echo "* $r"; else echo "  $r"; fi
  done
  exit 0
fi

target="${1:?usage: activate-release.sh <release-id>|--previous|--list}"
if [ "$target" = "--previous" ]; then
  target="$(ls -1 "$RELEASES" | sort | awk -v cur="$current" '$0 < cur' | tail -n 1)"
  if [ -z "$target" ]; then
    echo "no release older than $current" >&2
    exit 1
  fi
fi
if [ ! -x "$RELEASES/$target/bin/server" ]; then
  echo "release not found or incomplete: $RELEASES/$target" >&2
  exit 1
fi

switch_to() {
  ln -sfn "releases/$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
  "$RELEASES/$1/deploy/aws/server/install-config.sh"
  systemctl restart 100-journeys.service
}

healthy() {
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [ -f "$DB_PATH" ]; then
  echo "pre-deploy backup:"
  sudo -u journeys "$RELEASES/$target/deploy/aws/server/backup.sh" predeploy
fi

echo "activating $target (was $current)"
switch_to "$target"
if healthy; then
  echo "healthy: $target"
else
  echo "health check failed for $target" >&2
  journalctl -u 100-journeys.service -n 30 --no-pager >&2 || true
  if [ "$current" != "none" ] && [ -d "$RELEASES/$current" ]; then
    echo "rolling back to $current" >&2
    switch_to "$current"
    healthy && echo "rolled back to $current" >&2
  fi
  exit 1
fi

# Keep the newest $KEEP_RELEASES releases, never the active one or the one it replaced.
ls -1 "$RELEASES" | sort -r | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  if [ "$old" != "$target" ] && [ "$old" != "$current" ]; then
    rm -rf "${RELEASES:?}/$old"
  fi
done
