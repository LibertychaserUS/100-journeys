#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy/init-demo-data.sh [db-path]

Environment:
  DEMO_USERS=50
  DEMO_ADMINS=3
  DEMO_USER_EMAIL=demo-user@example.invalid
  DEMO_ADMIN_EMAIL=demo-admin@example.invalid
  DEMO_USER_PASSWORD=LocalDemoUserChangeMe12345
  DEMO_ADMIN_PASSWORD=LocalDemoAdminChangeMe12345!

What it does:
  - applies db/schema.sql
  - applies db/seed.sql
  - creates 50 realistic ordinary users, including DEMO_USER_EMAIL
  - creates 3 admin users, including DEMO_ADMIN_EMAIL
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
DEMO_USER_EMAIL="${DEMO_USER_EMAIL:-demo-user@example.invalid}"
DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-demo-admin@example.invalid}"
DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-LocalDemoUserChangeMe12345}"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-LocalDemoAdminChangeMe12345!}"

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
  -user-email "$DEMO_USER_EMAIL" \
  -admin-email "$DEMO_ADMIN_EMAIL" \
  -user-password "$DEMO_USER_PASSWORD" \
  -admin-password "$DEMO_ADMIN_PASSWORD"
