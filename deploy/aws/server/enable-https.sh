#!/usr/bin/env bash
# Obtain a Let's Encrypt certificate for $SERVER_NAME (webroot challenge, no email
# registered) and switch Nginx to the HTTPS site. Renewal runs from certbot.timer;
# the deploy hook reloads Nginx after each renewal.
#
# Usage (as root): enable-https.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. /etc/100-journeys/site.env
: "${SERVER_NAME:?SERVER_NAME missing from /etc/100-journeys/site.env}"

install -d -m 755 /var/www/letsencrypt
certbot certonly --webroot -w /var/www/letsencrypt -d "$SERVER_NAME" \
  --agree-tos --register-unsafely-without-email --non-interactive --keep-until-expiring

install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl enable --quiet --now certbot.timer

"$SCRIPT_DIR/install-config.sh"
