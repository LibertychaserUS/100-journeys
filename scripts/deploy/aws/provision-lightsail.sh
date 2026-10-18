#!/usr/bin/env bash
# Create (or complete) the Lightsail resources for 100 Journeys. Idempotent: existing
# resources are left as they are. Requires an authenticated AWS CLI (`aws login`).
#
# Creates: key pair (imported from SSH_KEY.pub), Ubuntu 24.04 instance with daily auto
# snapshots, static IP, block-storage data disk (attached, daily auto snapshots), and the
# instance firewall: 22 from SSH_CIDR only, 80 and 443 from anywhere.
#
# Environment (defaults in brackets):
#   NAME [100-journeys]  REGION [us-east-1]  AZ [us-east-1a]  BUNDLE [micro_3_0]
#   BLUEPRINT [ubuntu_24_04]  DISK_GB [8]  SNAPSHOT_TIME [06:00, UTC]
#   SSH_KEY [~/.ssh/100-journeys-lightsail]  (generated if missing; private key never leaves this machine)
#   SSH_CIDR [<this machine's public IP>/32]
set -euo pipefail

NAME="${NAME:-100-journeys}"
REGION="${REGION:-us-east-1}"
AZ="${AZ:-us-east-1a}"
BUNDLE="${BUNDLE:-micro_3_0}"
BLUEPRINT="${BLUEPRINT:-ubuntu_24_04}"
DISK_GB="${DISK_GB:-8}"
SNAPSHOT_TIME="${SNAPSHOT_TIME:-06:00}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/100-journeys-lightsail}"
SSH_CIDR="${SSH_CIDR:-$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')/32}"

INSTANCE="$NAME"
KEY_PAIR="$NAME-key"
STATIC_IP="$NAME-ip"
DISK="$NAME-data"
TAGS="key=project,value=$NAME"

ls_() { aws lightsail --region "$REGION" "$@"; }
exists() { "$@" >/dev/null 2>&1; }

wait_for() {
  local what="$1" want="$2"; shift 2
  for _ in $(seq 1 60); do
    [ "$("$@")" = "$want" ] && return 0
    sleep 5
  done
  echo "timed out waiting for $what to be $want" >&2
  exit 1
}

echo "account: $(aws sts get-caller-identity --query Account --output text)  region: $REGION"
echo "bundle $BUNDLE: \$$(ls_ get-bundles --query "bundles[?bundleId=='$BUNDLE'].price | [0]" --output text)/month"

if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -q -t ed25519 -N '' -C "$NAME-deploy" -f "$SSH_KEY"
fi
if ! exists ls_ get-key-pair --key-pair-name "$KEY_PAIR"; then
  ls_ import-key-pair --key-pair-name "$KEY_PAIR" --public-key-base64 "file://$SSH_KEY.pub" >/dev/null
  echo "imported key pair $KEY_PAIR"
fi

if ! exists ls_ get-instance --instance-name "$INSTANCE"; then
  ls_ create-instances --instance-names "$INSTANCE" --availability-zone "$AZ" \
    --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" --key-pair-name "$KEY_PAIR" \
    --ip-address-type ipv4 --tags "$TAGS" \
    --add-ons "addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=$SNAPSHOT_TIME}" >/dev/null
  echo "creating instance $INSTANCE"
fi
wait_for "instance $INSTANCE" running ls_ get-instance-state --instance-name "$INSTANCE" --query state.name --output text

if ! exists ls_ get-static-ip --static-ip-name "$STATIC_IP"; then
  ls_ allocate-static-ip --static-ip-name "$STATIC_IP" >/dev/null
  echo "allocated static IP $STATIC_IP"
fi
if [ "$(ls_ get-static-ip --static-ip-name "$STATIC_IP" --query staticIp.attachedTo --output text)" != "$INSTANCE" ]; then
  ls_ attach-static-ip --static-ip-name "$STATIC_IP" --instance-name "$INSTANCE" >/dev/null
  echo "attached static IP to $INSTANCE"
fi

if ! exists ls_ get-disk --disk-name "$DISK"; then
  ls_ create-disk --disk-name "$DISK" --availability-zone "$AZ" --size-in-gb "$DISK_GB" --tags "$TAGS" \
    --add-ons "addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=$SNAPSHOT_TIME}" >/dev/null
  echo "creating disk $DISK (${DISK_GB} GB)"
fi
for _ in $(seq 1 60); do
  state="$(ls_ get-disk --disk-name "$DISK" --query disk.state --output text)"
  if [ "$state" = "available" ] || [ "$state" = "in-use" ]; then break; fi
  sleep 5
done
if [ "$(ls_ get-disk --disk-name "$DISK" --query disk.attachedTo --output text)" != "$INSTANCE" ]; then
  ls_ attach-disk --disk-name "$DISK" --instance-name "$INSTANCE" --disk-path /dev/xvdf >/dev/null
  echo "attached disk $DISK"
fi

ls_ put-instance-public-ports --instance-name "$INSTANCE" --port-infos \
  "fromPort=22,toPort=22,protocol=tcp,cidrs=$SSH_CIDR" \
  "fromPort=80,toPort=80,protocol=tcp,cidrs=0.0.0.0/0" \
  "fromPort=443,toPort=443,protocol=tcp,cidrs=0.0.0.0/0" >/dev/null
echo "firewall: 22 from $SSH_CIDR; 80, 443 from anywhere"

ip="$(ls_ get-static-ip --static-ip-name "$STATIC_IP" --query staticIp.ipAddress --output text)"
echo
echo "static IP:   $ip"
echo "server name: ${ip//./-}.sslip.io"
echo "ssh:         ssh -i $SSH_KEY ubuntu@$ip"
