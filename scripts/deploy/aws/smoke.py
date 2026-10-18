#!/usr/bin/env python3
"""Post-deploy smoke test for 100 Journeys (stdlib only).

Usage:
  scripts/deploy/aws/smoke.py https://203-0-113-10.sslip.io            full check
  scripts/deploy/aws/smoke.py https://203-0-113-10.sslip.io --read-only  no writes

Full check registers a throwaway user (smoke-<time>@example.invalid), logs in,
recharges the wallet, creates an order, pays it and confirms the purchase
transaction. Read-only mode checks health, pages, static assets and public APIs.
Exit code is non-zero if any check fails.
"""

import json
import secrets
import sys
import time
import urllib.error
import urllib.request

BASE = ""
failures = []


def request(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers, err.read()


def api(method, path, body=None, token=None):
    status, _, raw = request(method, path, body, token)
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = {"error": raw[:200].decode(errors="replace")}
    return status, payload


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(name)
    return ok


def solve_captcha():
    _, payload = api("GET", "/api/captcha")
    data = payload["data"]
    a, op, b = data["question"].split()[:3]
    answer = int(a) + int(b) if op == "+" else int(a) - int(b)
    return data["id"], str(answer)


def read_only_checks():
    status, payload = api("GET", "/api/health")
    check("GET /api/health", status == 200 and payload.get("data", {}).get("status") == "ok", str(payload))

    status, headers, body = request("GET", "/")
    check("GET / (SPA shell)", status == 200 and b"window.APP_CONFIG" in body, f"HTTP {status}")

    for path, ctype in [
        ("/static/css/tokens.css", "text/css"),
        ("/static/js/router.js", "javascript"),
        ("/static/assets/images/avatars/github-default/avatar-00.svg", "image/svg+xml"),
    ]:
        status, headers, _ = request("GET", path)
        check(f"GET {path}", status == 200 and ctype in headers.get("Content-Type", ""), f"HTTP {status} {headers.get('Content-Type')}")

    status, payload = api("GET", "/api/journeys?limit=5")
    journeys = payload.get("data") or []
    check("GET /api/journeys", status == 200 and len(journeys) > 0, f"total={payload.get('total')}")

    slug = journeys[0]["slug"] if journeys else None
    if slug:
        status, payload = api("GET", f"/api/journeys/{slug}")
        check(f"GET /api/journeys/{slug}", status == 200 and payload.get("data", {}).get("slug") == slug)
        image = payload.get("data", {}).get("cover_image") or payload.get("data", {}).get("image_url")
        if image and image.startswith("/"):
            status, headers, _ = request("GET", image)
            check(f"GET {image}", status == 200 and headers.get("Content-Type", "").startswith("image/"), f"HTTP {status}")

    for path in ["/api/tags", "/api/mbti"]:
        status, _ = api("GET", path)
        check(f"GET {path}", status == 200, f"HTTP {status}")
    return slug


def write_checks(slug):
    email = f"smoke-{int(time.time())}@example.invalid"
    password = secrets.token_urlsafe(16)
    cid, ans = solve_captcha()
    status, payload = api("POST", "/api/auth/register", {
        "username": "smoke", "email": email, "password": password,
        "gender": "prefer_not_to_say", "captcha_id": cid, "captcha_answer": ans,
    })
    check("POST /api/auth/register", status in (200, 201), f"HTTP {status} {payload.get('error') or ''}")

    cid, ans = solve_captcha()
    status, payload = api("POST", "/api/auth/login", {
        "email": email, "password": password, "captcha_id": cid, "captcha_answer": ans,
    })
    token = (payload.get("data") or {}).get("token")
    if not check("POST /api/auth/login", status == 200 and bool(token), f"HTTP {status} {payload.get('error') or ''}"):
        return

    status, payload = api("GET", "/api/auth/me", token=token)
    check("GET /api/auth/me", status == 200 and payload.get("data", {}).get("email") == email, f"HTTP {status}")

    status, payload = api("POST", "/api/payments/recharge", {"amount": 100000}, token)
    check("POST /api/payments/recharge", status == 200, f"HTTP {status} {payload.get('error') or ''}")

    status, payload = api("POST", "/api/orders", {"items": [{"journey_slug": slug, "quantity": 1}]}, token)
    order = payload.get("data") or {}
    order_id = order.get("id")
    if not check("POST /api/orders", status in (200, 201) and order_id, f"HTTP {status} {payload.get('error') or ''}"):
        return

    status, payload = api("POST", f"/api/orders/{order_id}/pay", {}, token)
    check(f"POST /api/orders/{order_id}/pay", status == 200, f"HTTP {status} {payload.get('error') or ''}")

    status, payload = api("GET", f"/api/orders/{order_id}", token=token)
    check(f"GET /api/orders/{order_id} is paid", status == 200 and payload.get("data", {}).get("status") == "paid",
          f"status={payload.get('data', {}).get('status')}")

    status, payload = api("GET", "/api/payments/transactions", token=token)
    txns = payload.get("data") or []
    kinds = sorted({t.get("txn_type") for t in txns})
    check("GET /api/payments/transactions has recharge + purchase",
          status == 200 and "purchase" in kinds and "recharge" in kinds, f"types={kinds}")
    print(f"test account: {email} (throwaway, random password not kept)")


def main():
    global BASE
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    BASE = sys.argv[1].rstrip("/")
    read_only = "--read-only" in sys.argv[2:]
    slug = read_only_checks()
    if not read_only and slug:
        write_checks(slug)
    print(f"\n{'OK' if not failures else 'FAILED'}: {len(failures)} failure(s) against {BASE}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
