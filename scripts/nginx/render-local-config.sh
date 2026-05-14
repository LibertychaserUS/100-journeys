#!/usr/bin/env bash
set -euo pipefail

PUBLIC_PORT="${1:-18080}"
BACKEND_PORT="${2:-18081}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_FILE="$ROOT_DIR/deploy/nginx.local.conf"

mkdir -p \
  "$ROOT_DIR/.nginx/logs" \
  "$ROOT_DIR/.nginx/client_body_temp" \
  "$ROOT_DIR/.nginx/proxy_temp" \
  "$ROOT_DIR/.nginx/fastcgi_temp" \
  "$ROOT_DIR/.nginx/uwsgi_temp" \
  "$ROOT_DIR/.nginx/scgi_temp"

cat > "$OUT_FILE" <<EOF
worker_processes 1;
error_log $ROOT_DIR/.nginx/logs/error.log warn;
pid $ROOT_DIR/.nginx/nginx.pid;

events {
    worker_connections 1024;
}

http {
    default_type application/octet-stream;
    types {
        text/html html;
        text/css css;
        application/javascript js;
        application/json json;
        image/jpeg jpg jpeg;
        image/png png;
        image/svg+xml svg;
        image/webp webp;
    }

    access_log $ROOT_DIR/.nginx/logs/access.log;
    client_body_temp_path $ROOT_DIR/.nginx/client_body_temp;
    proxy_temp_path $ROOT_DIR/.nginx/proxy_temp;
    fastcgi_temp_path $ROOT_DIR/.nginx/fastcgi_temp;
    uwsgi_temp_path $ROOT_DIR/.nginx/uwsgi_temp;
    scgi_temp_path $ROOT_DIR/.nginx/scgi_temp;

    upstream journeys_api {
        server 127.0.0.1:$BACKEND_PORT;
        keepalive 32;
    }

    limit_req_zone \$binary_remote_addr zone=journeys_api_limit:10m rate=100r/s;
    limit_req_zone \$binary_remote_addr zone=journeys_auth_limit:10m rate=20r/s;

    server {
        listen 127.0.0.1:$PUBLIC_PORT;
        server_name localhost;

        limit_req_status 429;

        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
        gzip_min_length 1024;

        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        location /static/ {
            alias $ROOT_DIR/web/;
            expires 30d;
            add_header Cache-Control "public, max-age=2592000, immutable" always;
            try_files \$uri =404;
        }

        location /api/auth/ {
            limit_req zone=journeys_auth_limit burst=40 nodelay;
            proxy_pass http://journeys_api;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /api/ {
            limit_req zone=journeys_api_limit burst=200 nodelay;
            proxy_pass http://journeys_api;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 30s;
            proxy_send_timeout 30s;
        }

        location /uploads/ {
            proxy_pass http://journeys_api;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location / {
            proxy_pass http://journeys_api;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_read_timeout 30s;
            proxy_send_timeout 30s;
        }
    }
}
EOF

printf '%s\n' "$OUT_FILE"
