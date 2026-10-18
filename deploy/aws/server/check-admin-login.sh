#!/usr/bin/env bash
# Log in as the owner admin against the local API and print only the outcome.
# Usage (as root): check-admin-login.sh
set -euo pipefail

# shellcheck disable=SC1091
. /etc/100-journeys/credentials/accounts.env
API=http://127.0.0.1:8080/api

captcha="$(curl -fsS "$API/captcha")"
captcha_id="$(printf '%s' "$captcha" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])')"
answer="$(printf '%s' "$captcha" | python3 -c 'import json,sys; q=json.load(sys.stdin)["data"]["question"].split(); print(int(q[0])+int(q[2]) if q[1]=="+" else int(q[0])-int(q[2]))')"

body="$(EMAIL="$ADMIN_EMAIL" PASSWORD="$ADMIN_PASSWORD" CID="$captcha_id" ANS="$answer" python3 -c '
import json, os
print(json.dumps({"email": os.environ["EMAIL"], "password": os.environ["PASSWORD"],
                  "captcha_id": os.environ["CID"], "captcha_answer": os.environ["ANS"]}))')"
resp="$(curl -sS -H 'Content-Type: application/json' -d @- "$API/auth/login" <<<"$body")"
token="$(printf '%s' "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("data") or {}).get("token",""))')"
if [ -z "$token" ]; then
  echo "admin login FAILED: $(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error"))')" >&2
  exit 1
fi
stats="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$API/admin/stats")"
echo "admin login ok ($ADMIN_EMAIL); /api/admin/stats -> HTTP $stats"
