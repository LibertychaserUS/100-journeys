#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-./data/app.db}"
BACKUP_DIR="${2:-./data/backups}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required for a safe online backup" >&2
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/100-journeys-$timestamp.sqlite"

sqlite3 "$DB_PATH" ".backup '$target'"
sqlite3 "$target" "PRAGMA integrity_check;"

echo "$target"
