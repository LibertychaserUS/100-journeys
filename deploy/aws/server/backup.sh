#!/usr/bin/env bash
# Online SQLite backup with integrity check and retention.
#
# Usage (as the journeys user):
#   backup.sh              hourly backup (100-journeys-backup.timer); also keeps one copy per day
#   backup.sh predeploy    backup taken by activate-release.sh before switching releases
#
# Layout under $BACKUP_ROOT: hourly/ (keep 48), daily/ (keep 14), predeploy/ (keep 10).
# Files are gzip-compressed SQLite databases: restore with deploy/aws/server/restore.sh.
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/100-journeys/app.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/lib/100-journeys/backups}"
KEEP_HOURLY="${KEEP_HOURLY:-48}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_PREDEPLOY="${KEEP_PREDEPLOY:-10}"
kind="${1:-hourly}"

case "$kind" in
  hourly | predeploy) ;;
  *) echo "usage: backup.sh [hourly|predeploy]" >&2; exit 2 ;;
esac

# Callers use `sudo -u journeys`, which keeps a working directory (e.g. /home/ubuntu)
# this user cannot read; find(1) fails on that.
cd /

if [ ! -f "$DB_PATH" ]; then
  echo "database not found: $DB_PATH" >&2
  exit 1
fi

prune() {
  local dir="$1" keep="$2"
  find "$dir" -maxdepth 1 -name 'app-*.sqlite.gz' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" |
    while read -r old; do rm -f "$dir/$old"; done
}

mkdir -p "$BACKUP_ROOT/$kind"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$(mktemp "$BACKUP_ROOT/$kind/.app-$stamp.XXXXXX")"
trap 'rm -f "$tmp" "$tmp.gz"' EXIT

sqlite3 "$DB_PATH" ".backup '$tmp'"
check="$(sqlite3 "$tmp" 'PRAGMA integrity_check;')"
if [ "$check" != "ok" ]; then
  echo "integrity_check failed for backup of $DB_PATH: $check" >&2
  exit 1
fi
gzip -6 "$tmp"
target="$BACKUP_ROOT/$kind/app-$stamp.sqlite.gz"
mv "$tmp.gz" "$target"

if [ "$kind" = "hourly" ]; then
  mkdir -p "$BACKUP_ROOT/daily"
  today="$(date -u +%Y%m%d)"
  if ! compgen -G "$BACKUP_ROOT/daily/app-${today}T*.sqlite.gz" >/dev/null; then
    cp "$target" "$BACKUP_ROOT/daily/"
  fi
  prune "$BACKUP_ROOT/hourly" "$KEEP_HOURLY"
  prune "$BACKUP_ROOT/daily" "$KEEP_DAILY"
else
  prune "$BACKUP_ROOT/predeploy" "$KEEP_PREDEPLOY"
fi

echo "$target integrity_check=ok size=$(stat -c %s "$target")"
