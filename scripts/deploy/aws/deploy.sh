#!/usr/bin/env bash
# Build the current commit for Linux, upload it as a new release and activate it.
#
# Usage:
#   scripts/deploy/aws/deploy.sh <host> [server-name]
#
#   host         static IP (or DNS name) of the Lightsail instance
#   server-name  public hostname; required on the first deploy (runs bootstrap.sh),
#                e.g. 203-0-113-10.sslip.io
#
# Environment:
#   SSH_KEY      [~/.ssh/100-journeys-lightsail]
#   SSH_USER     [ubuntu]
#   ALLOW_DIRTY  set to 1 to deploy uncommitted changes (release id gets a -dirty suffix)
#   SKIP_SECRETS set to 1 to skip syncing secrets from AWS Secrets Manager
#   SECRETS_REGION [us-east-1]
#
# Secrets synced into /etc/100-journeys/100-journeys.env (needs `aws login` on this machine):
#   100-journeys/deepseek-api-key -> DEEPSEEK_API_KEY
#
# Release layout on the server: /opt/100-journeys/releases/<UTC time>-<sha>/
#   bin/{server,admin-user,demo-data}  web/  db/  deploy/aws/  REVISION
set -euo pipefail

HOST="${1:?usage: deploy.sh <host> [server-name]}"
SERVER_NAME="${2:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/100-journeys-lightsail}"
SSH_USER="${SSH_USER:-ubuntu}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
remote() { ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "$@"; }

sha="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  if [ "${ALLOW_DIRTY:-}" != "1" ]; then
    echo "working tree has uncommitted changes; commit them or set ALLOW_DIRTY=1" >&2
    exit 1
  fi
  sha="$sha-dirty"
fi
release="$(date -u +%Y%m%dT%H%M%SZ)-$sha"

arch="$(remote uname -m)"
case "$arch" in
  x86_64) goarch=amd64 ;;
  aarch64) goarch=arm64 ;;
  *) echo "unsupported server architecture: $arch" >&2; exit 1 ;;
esac

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
echo "building $release for linux/$goarch"
for cmd in server admin-user demo-data; do
  CGO_ENABLED=0 GOOS=linux GOARCH="$goarch" go build -trimpath -ldflags "-s -w" -o "$stage/bin/$cmd" "./cmd/$cmd"
done
mkdir -p "$stage/db" "$stage/deploy"
cp db/schema.sql db/seed.sql "$stage/db/"
rsync -a --exclude .DS_Store web "$stage/"
rsync -a deploy/aws "$stage/deploy/"
git rev-parse HEAD >"$stage/REVISION"

remote "test -d /opt/100-journeys/releases" || {
  if [ -z "$SERVER_NAME" ]; then
    echo "server is not bootstrapped; pass the server name, e.g. ${HOST//./-}.sslip.io" >&2
    exit 1
  fi
  bootstrap_needed=1
}

if [ "${bootstrap_needed:-}" = "1" ]; then
  # First deploy: upload to a temp dir, run bootstrap, then move into releases/.
  remote "rm -rf /tmp/100-journeys-$release && mkdir -p /tmp/100-journeys-$release"
  rsync -az --chmod=D755,F644 -e "ssh ${SSH_OPTS[*]}" "$stage"/ "$SSH_USER@$HOST:/tmp/100-journeys-$release/"
  remote "chmod 755 /tmp/100-journeys-$release/bin/* /tmp/100-journeys-$release/deploy/aws/server/*.sh &&
    sudo /tmp/100-journeys-$release/deploy/aws/server/bootstrap.sh '$SERVER_NAME' &&
    mv /tmp/100-journeys-$release /opt/100-journeys/releases/$release"
else
  current="$(remote 'readlink /opt/100-journeys/current || true')"
  link_dest=()
  [ -n "$current" ] && link_dest=(--link-dest="/opt/100-journeys/$current")
  rsync -az --chmod=D755,F644 "${link_dest[@]}" -e "ssh ${SSH_OPTS[*]}" \
    "$stage"/ "$SSH_USER@$HOST:/opt/100-journeys/releases/$release/"
  remote "chmod 755 /opt/100-journeys/releases/$release/bin/* /opt/100-journeys/releases/$release/deploy/aws/server/*.sh"
fi

# Secrets: read from AWS Secrets Manager with this machine's AWS CLI login and piped over
# SSH stdin into the root-only EnvironmentFile (never in arguments, output or git).
# A missing secret or unavailable CLI leaves the server's current value as it is.
sync_secret() {
  local secret_id="$1" var="$2" value err
  [ "${SKIP_SECRETS:-}" = "1" ] && return 0
  if ! command -v aws >/dev/null 2>&1; then
    echo "warning: aws CLI not found; $var left as is" >&2
    return 0
  fi
  err="$(mktemp)"
  if ! value="$(aws secretsmanager get-secret-value --region "$SECRETS_REGION" --secret-id "$secret_id" \
    --query SecretString --output text 2>"$err")"; then
    if grep -q ResourceNotFoundException "$err"; then
      echo "secret $secret_id not found; $var left as is"
    else
      echo "warning: could not read secret $secret_id ($(head -c 200 "$err" | tr '\n' ' ')); $var left as is" >&2
    fi
    rm -f "$err"
    return 0
  fi
  rm -f "$err"
  printf '%s' "$value" | remote "sudo /opt/100-journeys/releases/$release/deploy/aws/server/set-env.sh $var"
}
SECRETS_REGION="${SECRETS_REGION:-us-east-1}"
sync_secret 100-journeys/deepseek-api-key DEEPSEEK_API_KEY

remote "sudo /opt/100-journeys/releases/$release/deploy/aws/server/activate-release.sh $release"

server_name="$(remote '. /etc/100-journeys/site.env && echo "$SERVER_NAME"')"
echo
echo "deployed $release"
echo "public health: $(curl -sS --max-time 10 "https://$server_name/api/health" 2>/dev/null ||
  curl -sS --max-time 10 "http://$HOST/api/health")"
