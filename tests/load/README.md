# Load Test Suite

These are real k6 scripts against the running Go API. They cover distinct pressure surfaces:

1. `public-content-flow.k6.js` — public browsing, search, filters, detail API.
2. `auth-register-login.k6.js` — captcha-aware registration and login.
3. `order-payment-audit.k6.js` — P0 order creation, recharge, payment, ledger verification.
4. `admin-analytics-export.k6.js` — analytics ingestion, admin dashboard stats, CSV export. Requires `ADMIN_TOKEN`.
5. `pet-chat-analytics.k6.js` — pet reply concurrency and analytics buffer pressure.
6. `image-static-cache.k6.js` — static image throughput, cache headers, optimized asset size.

Local smoke example:

```bash
BASE_URL=http://127.0.0.1:8080 VUS=20 DURATION=1m k6 run tests/load/public-content-flow.k6.js
```

Target-capacity examples:

```bash
BASE_URL=https://your-api.example.com VUS=3000 DURATION=5m k6 run tests/load/public-content-flow.k6.js
BASE_URL=https://your-api.example.com VUS=100 DURATION=5m k6 run tests/load/auth-register-login.k6.js
BASE_URL=https://your-api.example.com VUS=500 DURATION=5m k6 run tests/load/order-payment-audit.k6.js
BASE_URL=https://your-api.example.com VUS=50 DURATION=5m k6 run tests/load/pet-chat-analytics.k6.js
BASE_URL=https://your-api.example.com VUS=2000 DURATION=5m k6 run tests/load/image-static-cache.k6.js
```

For admin export:

```bash
BASE_URL=https://your-api.example.com ADMIN_TOKEN=... VUS=20 DURATION=3m k6 run tests/load/admin-analytics-export.k6.js
```

SQLite is a single-writer database. If the P0 order script shows write lock errors at high VUS, treat that as a scaling finding rather than hiding it with client retries.

For local Go static delivery, 2000 concurrent image requests passed in the Go stress harness, while 3000 exposed connection timeouts. Use Nginx/CDN before claiming medium-site production readiness for static images.
