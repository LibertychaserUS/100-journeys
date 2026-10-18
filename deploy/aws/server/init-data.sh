#!/usr/bin/env bash
# Initialise (or reset) the production database with demo content and the owner admin.
#
# Usage (as root):
#   init-data.sh            first run only; refuses if the database already has users
#   init-data.sh --reset    back up and discard the current database, then re-initialise
#
# Environment:
#   ADMIN_EMAIL     owner admin email      (default: admin@100-journeys.invalid)
#   ADMIN_USERNAME  owner admin username   (default: owner)
#   DEMO_USERS      demo ordinary users    (default: 50)
#
# Passwords are generated here and stored only in /etc/100-journeys/credentials/accounts.env
# (root, 0600). They are reused on --reset and never printed. Read them with:
#   sudo cat /etc/100-journeys/credentials/accounts.env
set -euo pipefail

RELEASE_DIR=/opt/100-journeys/current
DATA_DIR=/var/lib/100-journeys
DB_PATH="$DATA_DIR/app.db"
CREDS=/etc/100-journeys/credentials/accounts.env

if [ -f "$DB_PATH" ]; then
  users="$(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM users;' 2>/dev/null || echo 0)"
  if [ "$users" != "0" ] && [ "${1:-}" != "--reset" ]; then
    echo "database already has $users users: $DB_PATH (use --reset to back up and re-initialise)" >&2
    exit 1
  fi
  sudo -u journeys "$RELEASE_DIR/deploy/aws/server/backup.sh" predeploy
fi

gen_password() { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20; }

if [ ! -f "$CREDS" ]; then
  umask 077
  install -d -m 700 "$(dirname "$CREDS")"
  cat >"$CREDS" <<CREDS_EOF
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@100-journeys.invalid}
ADMIN_USERNAME=${ADMIN_USERNAME:-owner}
ADMIN_PASSWORD=$(gen_password)
DEMO_USER_EMAIL=demo-user@example.invalid
DEMO_USER_PASSWORD=$(gen_password)
DEMO_ADMIN_EMAIL=demo-admin@example.invalid
DEMO_ADMIN_PASSWORD=$(gen_password)
CREDS_EOF
  umask 022
fi
chmod 600 "$CREDS"
# shellcheck disable=SC1090
. "$CREDS"

systemctl stop 100-journeys.service
rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
find "$DATA_DIR/uploads" -mindepth 1 -delete
install -d -o journeys -g journeys -m 750 "$DATA_DIR/uploads"
avatars="$(mktemp -d)"
chown journeys:journeys "$avatars"
log="$(mktemp)"
trap 'rm -rf "$avatars" "$log"' EXIT

cd "$RELEASE_DIR"
# demo-data prints the passwords it was given, so its output goes to a root-only
# temp file and only lines without credentials are shown.
if ! sudo -u journeys env \
  DEMO_USER_EMAIL="$DEMO_USER_EMAIL" DEMO_USER_PASSWORD="$DEMO_USER_PASSWORD" \
  DEMO_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL" DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" \
  ./bin/demo-data -db "$DB_PATH" -schema db/schema.sql -seed db/seed.sql \
  -upload-dir "$DATA_DIR/uploads" -avatar-assets "$avatars" \
  -avatar-url-base /static/assets/images/avatars/github-default \
  -users "${DEMO_USERS:-50}" -admins 3 >"$log" 2>&1; then
  grep -v 'login:' "$log" >&2
  echo "demo-data failed" >&2
  exit 1
fi
grep -v 'login:' "$log"

sudo -u journeys env ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ./bin/admin-user -db "$DB_PATH" -schema db/schema.sql \
  -email "$ADMIN_EMAIL" -username "$ADMIN_USERNAME"

systemctl start 100-journeys.service
for _ in $(seq 1 20); do
  curl -fsS --max-time 2 http://127.0.0.1:8080/api/health >/dev/null 2>&1 && break
  sleep 1
done
echo "data initialised; credentials in $CREDS"
