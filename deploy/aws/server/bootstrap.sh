#!/usr/bin/env bash
# One-time server setup for a fresh Ubuntu 24.04 Lightsail instance. Idempotent.
#
# Usage (as root): bootstrap.sh <server-name>
#   server-name: public hostname, e.g. 203-0-113-10.sslip.io or journeys.example.com
#
# - installs nginx, sqlite3, certbot; adds a 1 GiB swap file
# - formats (first run only) and mounts the attached Lightsail data disk at /var/lib/100-journeys
# - creates the unprivileged journeys user and /opt/100-journeys/releases (owned by the deploy user)
# - writes /etc/100-journeys/site.env and 100-journeys.env with a random JWT_SECRET (never overwritten)
set -euo pipefail

SERVER_NAME="${1:?usage: bootstrap.sh <server-name>}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DATA_DIR=/var/lib/100-journeys
DATA_LABEL=journeys-data

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx sqlite3 certbot curl unattended-upgrades >/dev/null

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
swapon --show=NAME | grep -q /swapfile || swapon /swapfile

id journeys >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin journeys

# Data disk: the attached disk is the only whole disk without partitions that is not the root disk.
if ! grep -q "LABEL=$DATA_LABEL" /etc/fstab; then
  root_disk="$(lsblk -nro PKNAME,MOUNTPOINT | awk '$2 == "/" {print $1}')"
  data_dev=""
  for dev in $(lsblk -dno NAME,TYPE | awk '$2 == "disk" {print $1}'); do
    [ "$dev" = "$root_disk" ] && continue
    [ "$(lsblk -no NAME "/dev/$dev" | wc -l)" -eq 1 ] || continue
    data_dev="/dev/$dev"
  done
  if [ -z "$data_dev" ]; then
    echo "no attached data disk found; attach the Lightsail disk first" >&2
    exit 1
  fi
  if [ -z "$(blkid -o value -s TYPE "$data_dev" || true)" ]; then
    echo "formatting $data_dev as ext4 ($DATA_LABEL)"
    mkfs.ext4 -q -L "$DATA_LABEL" "$data_dev"
  fi
  mkdir -p "$DATA_DIR"
  echo "LABEL=$DATA_LABEL $DATA_DIR ext4 defaults,noatime,nofail 0 2" >>/etc/fstab
  systemctl daemon-reload
fi
mountpoint -q "$DATA_DIR" || mount "$DATA_DIR"
install -d -o journeys -g journeys -m 750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/backups"

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 /opt/100-journeys /opt/100-journeys/releases

install -d -m 755 /etc/100-journeys
install -d -m 700 /etc/100-journeys/credentials
printf 'SERVER_NAME=%s\n' "$SERVER_NAME" >/etc/100-journeys/site.env
if [ ! -f /etc/100-journeys/100-journeys.env ]; then
  umask 077
  cat >/etc/100-journeys/100-journeys.env <<EOF
PORT=8080
BIND_ADDR=127.0.0.1:8080
DB_PATH=$DATA_DIR/app.db
UPLOAD_DIR=$DATA_DIR/uploads
CORS_ORIGINS=https://$SERVER_NAME
JWT_SECRET=$(openssl rand -hex 32)
EOF
  umask 022
fi
chmod 600 /etc/100-journeys/100-journeys.env

echo "bootstrap complete: server_name=$SERVER_NAME data=$(findmnt -no SOURCE "$DATA_DIR")"
