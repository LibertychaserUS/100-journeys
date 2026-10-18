#!/usr/bin/env bash
# Install systemd units and Nginx config from this release onto the server.
# Idempotent. Renders the HTTPS site once a certificate for $SERVER_NAME exists,
# otherwise the HTTP-only site. Run as root; called by bootstrap.sh,
# activate-release.sh and enable-https.sh.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AWS_DIR="$RELEASE_DIR/deploy/aws"

# shellcheck disable=SC1091
. /etc/100-journeys/site.env
: "${SERVER_NAME:?SERVER_NAME missing from /etc/100-journeys/site.env}"

install -m 644 "$AWS_DIR/systemd/100-journeys.service" /etc/systemd/system/100-journeys.service
install -m 644 "$AWS_DIR/systemd/100-journeys-backup.service" /etc/systemd/system/100-journeys-backup.service
install -m 644 "$AWS_DIR/systemd/100-journeys-backup.timer" /etc/systemd/system/100-journeys-backup.timer
systemctl daemon-reload
systemctl enable --quiet 100-journeys.service 100-journeys-backup.timer
systemctl start 100-journeys-backup.timer

install -d -m 755 /etc/nginx/snippets /var/www/letsencrypt
install -m 644 "$AWS_DIR/nginx/100-journeys-common.conf" /etc/nginx/conf.d/100-journeys-common.conf
install -m 644 "$AWS_DIR/nginx/100-journeys-locations.conf" /etc/nginx/snippets/100-journeys-locations.conf
install -m 644 "$AWS_DIR/nginx/100-journeys-proxy.conf" /etc/nginx/snippets/100-journeys-proxy.conf
[ -f /etc/nginx/100-journeys-limit-exempt.conf ] || install -m 644 /dev/null /etc/nginx/100-journeys-limit-exempt.conf

if [ -f "/etc/letsencrypt/live/$SERVER_NAME/fullchain.pem" ]; then
  template="$AWS_DIR/nginx/site-https.conf.tmpl"
else
  template="$AWS_DIR/nginx/site-http.conf.tmpl"
fi
sed "s/__SERVER_NAME__/$SERVER_NAME/g" "$template" >/etc/nginx/sites-available/100-journeys
ln -sfn /etc/nginx/sites-available/100-journeys /etc/nginx/sites-enabled/100-journeys
rm -f /etc/nginx/sites-enabled/default

nginx -t -q
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  systemctl enable --quiet --now nginx
fi
echo "config installed from $RELEASE_DIR ($(basename "$template" .conf.tmpl))"
