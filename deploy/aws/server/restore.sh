#!/usr/bin/env bash
# Restore the SQLite database from a backup produced by backup.sh.
#
# Usage (as root): restore.sh <backup.sqlite.gz> | latest
#   latest = newest file in backups/hourly
# The current database files are moved to /var/lib/100-journeys/quarantine/<timestamp>/,
# never deleted.
set -euo pipefail

backup="${1:?usage: restore.sh <backup.sqlite.gz>|latest}"
DATA_DIR=/var/lib/100-journeys
DB_PATH="$DATA_DIR/app.db"

if [ "$backup" = "latest" ]; then
  backup="$(find "$DATA_DIR/backups/hourly" -maxdepth 1 -name 'app-*.sqlite.gz' | sort | tail -n 1)"
  [ -n "$backup" ] || { echo "no hourly backups found" >&2; exit 1; }
fi
echo "restoring from $backup"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gunzip -c "$backup" >"$work/app.db"
check="$(sqlite3 "$work/app.db" 'PRAGMA integrity_check;')"
if [ "$check" != "ok" ]; then
  echo "backup failed integrity_check: $check" >&2
  exit 1
fi

systemctl stop 100-journeys.service
quarantine="$DATA_DIR/quarantine/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o journeys -g journeys -m 750 "$quarantine"
for f in "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"; do
  [ -f "$f" ] && mv "$f" "$quarantine/"
done
install -o journeys -g journeys -m 640 "$work/app.db" "$DB_PATH"
systemctl start 100-journeys.service

for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:8080/api/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "restored $backup; previous files in $quarantine"
    exit 0
  fi
  sleep 1
done
echo "API unhealthy after restore; previous files in $quarantine" >&2
exit 1
