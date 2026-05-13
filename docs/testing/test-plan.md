# Test Plan — 100 Journeys

**Standard**: ISO/IEC/IEEE 29119-3 style test documentation  
**Updated**: 2026-05-14  
**Scope**: Unit, integration, browser E2E, load and stress validation.

---

## 1. Test Scope

| Level | Target | Tool |
|---|---|---|
| Unit | Repository, service, buffer behavior | Go `testing` |
| Integration | Gin handlers + real SQLite temp DB | Go `httptest` |
| E2E | Browser user flows | Playwright |
| Load | API and static-resource load | k6 |
| Stress | Local high-concurrency stability | Go build-tagged stress tests |

## 2. Current Verification Status

| Suite | Status |
|---|---|
| `go test ./...` | Passing in current branch |
| `go vet ./...` | Passing in current branch |
| JS syntax check | Passing in current branch |
| Go medium-site stress | Passing with API 3000, buffer 20000, orders 500, admin 300, images 2000 |
| Go explosive stress | Failing at local static image 3000+, exposes CDN/Nginx requirement |
| k6 scripts | Written, not executed because `k6` is not installed locally |
| Playwright E2E | Needs a fresh full run after current redesign |

## 3. Test Case IDs

Format: `[LEVEL]-[MODULE]-[NNN]`

- `UT-REPO-001`: Repository unit test.
- `IT-API-001`: HTTP integration test.
- `E2E-HOME-001`: Browser home flow.
- `LOAD-PUBLIC-001`: k6 public content load.
- `STRESS-ORDER-001`: Go stress order/payment audit test.

## 4. Required E2E Cases

| ID | Scenario | Expected |
|---|---|---|
| E2E-HOME-001 | Open homepage | Hero concept, search, mood/persona controls visible. |
| E2E-HOME-002 | Card grid renders | At least 5 journey cards visible and no title clipping. |
| E2E-HOME-003 | Search unmatched keyword | Empty state is product-flavored and recoverable. |
| E2E-FILTER-001 | Mood filter | Feed updates with matching mood semantics. |
| E2E-FILTER-002 | MBTI/persona filter | Cards show matching persona/MBTI tags. |
| E2E-DETAIL-001 | Open card detail | Role, mission, clues, risks/preparation shown. |
| E2E-AUTH-001 | Register with captcha | User can register with username, gender, password, optional avatar. |
| E2E-AUTH-002 | Login/logout | Header state changes correctly. |
| E2E-ORDER-001 | Recharge and pay | Wallet decreases, order becomes paid, transaction exists. |
| E2E-ADMIN-001 | Admin dashboard | Stats render for admin and reject normal user. |
| E2E-ERROR-001 | Console errors | Main browse flow has no unexpected console errors. |

## 5. Load Scripts

| Script | Surface |
|---|---|
| `tests/load/public-content-flow.k6.js` | health, tags, journey list, search, filter, detail |
| `tests/load/auth-register-login.k6.js` | captcha-aware registration/login |
| `tests/load/order-payment-audit.k6.js` | recharge, order, payment, ledger |
| `tests/load/admin-analytics-export.k6.js` | analytics ingestion, stats, export |
| `tests/load/pet-chat-analytics.k6.js` | pet reply concurrency and tracking |
| `tests/load/image-static-cache.k6.js` | image throughput and cache headers |

## 6. Stress Matrix

| ID | Test | Default | Target profile |
|---|---|---:|---:|
| STRESS-PUBLIC-001 | Public browse flow | 300 | 3000 |
| STRESS-ANALYTICS-001 | Analytics buffer | 3050 | 20000 |
| STRESS-ORDER-001 | Users + orders + payment | 100 users / 500 orders | same |
| STRESS-ADMIN-001 | Admin stats/export | 100 | 300 |
| STRESS-IMAGE-001 | Static images | 300 | 2000 |

Target command:

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

Explosive command:

```bash
STRESS_PUBLIC_REQUESTS=6000 \
STRESS_ANALYTICS_EVENTS=10000 \
STRESS_USERS=200 \
STRESS_ORDERS=1000 \
STRESS_ADMIN_REQUESTS=600 \
STRESS_IMAGE_REQUESTS=6000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=420s
```

## 7. Acceptance Rules

- P0 order/payment tests must be lossless: paid orders, order items, transactions, and balances must match.
- P1 admin and audit tests may tolerate latency but not missing authorization checks.
- P2 analytics may drop events only after documented buffer capacity is exceeded.
- A failed explosive stress test is acceptable if the saturation point is documented and no false production claim is made.
- Static image stress above 2000 local concurrent requests requires a production static layer before claiming medium-site readiness.
