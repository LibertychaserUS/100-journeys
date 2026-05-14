#!/usr/bin/env bash
set -euo pipefail

PUBLIC_PORT=18080
API_PORT=18081
MAX_PORT_RETRIES=5
DB_PATH=""
SEED_DEMO=1
USE_NGINX=1
STOP_ONLY=0
DEMO_USER_EMAIL="${DEMO_USER_EMAIL:-demo-user@example.invalid}"
DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-demo-admin@example.invalid}"
DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-LocalDemoUserChangeMe12345}"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-LocalDemoAdminChangeMe12345!}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy/local-one-click.sh [options]

Options:
  --public-port PORT      Preferred browser port. Default: 18080
  --api-port PORT         Preferred Go API port. Default: 18081
  --max-port-retries N    Stop after N automatic port increments. Default: 5
  --db PATH               SQLite database path. Default: ./data/local-one-click.db
  --skip-demo             Do not initialize demo users/admins.
  --no-nginx              Serve directly from Go if you do not want local Nginx.
  --stop                  Stop the previous local one-click Go/Nginx processes.

What it does:
  - auto-selects free ports if the requested ports are occupied
  - initializes SQLite schema, seed journeys, 50 users, and 3 admins
  - starts the Go full-stack server on 127.0.0.1:<api-port>
  - starts local Nginx on 127.0.0.1:<public-port> when Nginx is installed
  - prints the final URL, ports, DB path, and demo accounts
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --public-port) PUBLIC_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --max-port-retries) MAX_PORT_RETRIES="$2"; shift 2 ;;
    --db) DB_PATH="$2"; shift 2 ;;
    --skip-demo) SEED_DEMO=0; shift ;;
    --no-nginx) USE_NGINX=0; shift ;;
    --stop) STOP_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$ROOT_DIR/tmp/local-one-click"
PID_FILE="$RUN_DIR/server.pid"
PORT_FILE="$RUN_DIR/ports.env"
LOG_FILE="$RUN_DIR/server.log"

if [ -z "$DB_PATH" ]; then
  DB_PATH="$ROOT_DIR/data/local-one-click.db"
elif [[ "$DB_PATH" != /* ]]; then
  DB_PATH="$ROOT_DIR/$DB_PATH"
fi

mkdir -p "$RUN_DIR" "$ROOT_DIR/data"

port_available() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
sys.exit(0)
PY
}

find_free_port_with_limit() {
  local port="$1"
  local start="$1"
  local limit="$2"
  local attempts=0
  while ! port_available "$port"; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$limit" ]; then
      local end=$((start + limit - 1))
      echo "No free port found in range $start-$end." >&2
      echo "Likely reason: another local service is occupying these ports, or a previous process is still shutting down." >&2
      echo "Run 'scripts/deploy/local-one-click.sh --stop' and 'lsof -nP -iTCP:$start-$end -sTCP:LISTEN', or choose another range with --public-port/--api-port." >&2
      exit 4
    fi
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

stop_previous() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      for _ in $(seq 1 20); do
        if ! kill -0 "$pid" >/dev/null 2>&1; then
          break
        fi
        sleep 0.1
      done
    fi
    rm -f "$PID_FILE"
  fi

  if command -v nginx >/dev/null 2>&1 && [ -f "$ROOT_DIR/.nginx/nginx.pid" ]; then
    nginx -s stop -c "$ROOT_DIR/deploy/nginx.local.conf" -p "$ROOT_DIR/.nginx" >/dev/null 2>&1 || true
  fi
}

stop_previous
if [ "$STOP_ONLY" -eq 1 ]; then
  echo "local one-click stack stopped"
  exit 0
fi

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required. Install Go 1.22+ and rerun." >&2
  exit 3
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for portable port detection." >&2
  exit 3
fi

API_PORT="$(find_free_port_with_limit "$API_PORT" "$MAX_PORT_RETRIES")"
if [ "$USE_NGINX" -eq 1 ]; then
  PUBLIC_PORT="$(find_free_port_with_limit "$PUBLIC_PORT" "$MAX_PORT_RETRIES")"
else
  PUBLIC_PORT="$API_PORT"
fi

cd "$ROOT_DIR"

if [ "$SEED_DEMO" -eq 1 ]; then
  DEMO_USER_PASSWORD="$DEMO_USER_PASSWORD" \
  DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" \
  DEMO_USER_EMAIL="$DEMO_USER_EMAIL" \
  DEMO_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL" \
  "$ROOT_DIR/scripts/deploy/init-demo-data.sh" "$DB_PATH"
else
  mkdir -p "$(dirname "$DB_PATH")"
fi

start_go_server() {
  : > "$LOG_FILE"
  PORT="$API_PORT" \
  BIND_ADDR="127.0.0.1:$API_PORT" \
  DB_PATH="$DB_PATH" \
  UPLOAD_DIR="$ROOT_DIR/data/uploads" \
  go run ./cmd/server >"$LOG_FILE" 2>&1 &

  SERVER_PID="$!"
  echo "$SERVER_PID" > "$PID_FILE"
}

SERVER_PID=""
go_ready=0
api_start_port="$API_PORT"
for _ in $(seq 1 "$MAX_PORT_RETRIES"); do
  API_PORT="$(find_free_port_with_limit "$API_PORT" "$MAX_PORT_RETRIES")"
  start_go_server

  for _ in $(seq 1 80); do
    if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
      go_ready=1
      break
    fi
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done

  if [ "$go_ready" -eq 1 ]; then
    break
  fi

  if grep -qi "address already in use" "$LOG_FILE"; then
    API_PORT=$((API_PORT + 1))
    rm -f "$PID_FILE"
    continue
  fi

  echo "Go server exited before becoming healthy. Log:" >&2
  tail -80 "$LOG_FILE" >&2 || true
  exit 4
done

if [ "$go_ready" -ne 1 ]; then
  api_end_port=$((api_start_port + MAX_PORT_RETRIES - 1))
  echo "Go server did not become healthy after $MAX_PORT_RETRIES port attempts." >&2
  echo "Attempted API port range: $api_start_port-$api_end_port." >&2
  echo "Likely reason: another local service is occupying these ports, or a previous Go process is still shutting down." >&2
  echo "Run 'scripts/deploy/local-one-click.sh --stop' and 'lsof -nP -iTCP:$api_start_port-$api_end_port -sTCP:LISTEN', or choose another range with --api-port." >&2
  echo "Last server log:" >&2
  tail -80 "$LOG_FILE" >&2 || true
  exit 4
fi

URL="http://127.0.0.1:$API_PORT/"
if [ "$USE_NGINX" -eq 1 ] && command -v nginx >/dev/null 2>&1; then
  nginx_ready=0
  public_start_port="$PUBLIC_PORT"
  for _ in $(seq 1 "$MAX_PORT_RETRIES"); do
    PUBLIC_PORT="$(find_free_port_with_limit "$PUBLIC_PORT" "$MAX_PORT_RETRIES")"
    "$ROOT_DIR/scripts/nginx/render-local-config.sh" "$PUBLIC_PORT" "$API_PORT" >/dev/null
    nginx -t -c "$ROOT_DIR/deploy/nginx.local.conf" -p "$ROOT_DIR/.nginx" >/dev/null
    if nginx -c "$ROOT_DIR/deploy/nginx.local.conf" -p "$ROOT_DIR/.nginx" >/dev/null 2>&1; then
      nginx_ready=1
      break
    fi
    PUBLIC_PORT=$((PUBLIC_PORT + 1))
  done
  if [ "$nginx_ready" -eq 1 ]; then
    URL="http://127.0.0.1:$PUBLIC_PORT/"
  else
    public_end_port=$((public_start_port + MAX_PORT_RETRIES - 1))
    echo "local Nginx could not start after $MAX_PORT_RETRIES port attempts." >&2
    echo "Attempted browser port range: $public_start_port-$public_end_port." >&2
    echo "Likely reason: these ports are occupied by another local service or a previous Nginx instance." >&2
    echo "Run 'scripts/deploy/local-one-click.sh --stop' and 'lsof -nP -iTCP:$public_start_port-$public_end_port -sTCP:LISTEN', or choose another range with --public-port." >&2
    exit 4
  fi
elif [ "$USE_NGINX" -eq 1 ]; then
  echo "nginx not found; falling back to direct Go URL."
fi

curl -fsS "$URL/api/health" >/dev/null
curl -fsS "$URL/api/journeys?limit=3" >/dev/null

cat > "$PORT_FILE" <<EOF
PUBLIC_PORT=$PUBLIC_PORT
API_PORT=$API_PORT
DB_PATH=$DB_PATH
URL=$URL
SERVER_PID=$SERVER_PID
EOF

cat <<EOF
Local full-stack deployment is running.

URL: $URL
Go API: http://127.0.0.1:$API_PORT/
SQLite DB: $DB_PATH
Log: $LOG_FILE
Stop: scripts/deploy/local-one-click.sh --stop

User: $DEMO_USER_EMAIL / $DEMO_USER_PASSWORD
Admin: $DEMO_ADMIN_EMAIL / $DEMO_ADMIN_PASSWORD
EOF
