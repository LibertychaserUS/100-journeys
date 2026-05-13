#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy/init-demo-data.sh [db-path]

Environment:
  DEMO_USERS=50
  DEMO_ADMINS=3
  DEMO_USER_PASSWORD=TaoyuanUser12345
  DEMO_ADMIN_PASSWORD=TaoyuanAdmin12345

What it does:
  - applies db/schema.sql
  - applies db/seed.sql
  - creates 50 realistic ordinary users, including user@100journeys.demo
  - creates 3 admin users, including admin@100journeys.demo
  - creates avatars, orders, transactions, points history, analytics, and audit evidence
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_PATH="${1:-${DB_PATH:-$ROOT_DIR/data/app.db}}"
DEMO_USERS="${DEMO_USERS:-50}"
DEMO_ADMINS="${DEMO_ADMINS:-3}"
DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-TaoyuanUser12345}"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-TaoyuanAdmin12345}"

mkdir -p "$(dirname "$DB_PATH")" "$ROOT_DIR/data/uploads"

cd "$ROOT_DIR"
go run ./cmd/demo-data \
  -db "$DB_PATH" \
  -schema "$ROOT_DIR/db/schema.sql" \
  -seed "$ROOT_DIR/db/seed.sql" \
  -upload-dir "$ROOT_DIR/data/uploads" \
  -avatar-assets "$ROOT_DIR/web/assets/images/avatars/github-default" \
  -avatar-url-base "/static/assets/images/avatars/github-default" \
  -users "$DEMO_USERS" \
  -admins "$DEMO_ADMINS" \
  -user-password "$DEMO_USER_PASSWORD" \
  -admin-password "$DEMO_ADMIN_PASSWORD"
