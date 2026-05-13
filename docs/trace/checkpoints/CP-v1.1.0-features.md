# Checkpoint CP-v1.1.0 — Feature Expansion: Orders, Payments, Points, Levels

> Date: 2026-05-13
> Branch: `dev/v1.1.0`
> Tag: `v1.1.0`
> Status: E2E Complete, Go Tests Green

---

## 1. Snapshot

| Component | Files | Status |
|-----------|-------|--------|
| DB Schema | `db/schema.sql`, `db/seed.sql` | Migrated (new tables + columns) |
| Backend Models | `internal/model/order.go`, `transaction.go`, `user.go`, `journey.go` | ✅ |
| Backend Repos | `internal/repository/order_repo.go`, `transaction_repo.go`, `user_repo.go` | ✅ |
| Backend Handlers | `internal/handler/order_handler.go`, `payment_handler.go` | ✅ |
| Frontend Pages | `web/js/pages/recharge.js`, `profile.js`, `detail.js` | ✅ |
| Frontend API | `web/js/api.js` | ✅ |
| Frontend CSS | `web/css/pages/recharge.css`, `profile.css` | ✅ |
| E2E Tests | `e2e/tests/orders.spec.js`, `auth.spec.js` | 29/29 passing |

---

## 2. Features Delivered

### 2.1 Order & Payment System
- **Unique order numbers**: `JNY` + timestamp + random (e.g., `JNY202605131200001234`)
- **Multi-item orders**: `CreateOrder` accepts `[]CreateOrderItem` — supports bulk/multi-journey checkout
- **Atomic payment**: `BEGIN → verify ownership → check balance → deduct → ledger → mark paid → COMMIT`
- **Financial-grade integer storage**: all amounts stored as `INTEGER` (smallest unit), zero floats
- **Audit trail**: every balance change recorded in `transactions` table with `txn_type`, `amount`, `balance_after`

### 2.2 Virtual Currency — 不思议币 (WonderCoin)
- 7 recharge tiers: 60 / 300 / 680 / 1,280 / 3,280 / 6,480 / 9,980
- Bonus amounts: 0 / 30 / 88 / 198 / 688 / 1,588 / 2,888
- Custom amount input supported
- Simulated recharge — no real money, instant balance increase
- Game-style UI with gradient submit button, hot-tag badges

### 2.3 Journey Pricing
- 5 sample journeys with simulated prices:
  - Bolivia salt flat: 15,999
  - Iceland lava tunnel: 19,999
  - Japan temple onsen: 8,999
  - Morocco Sahara: 12,999
  - Greenland dog sled: 29,999

### 2.4 Points & Level System
- New users receive **5,000 welcome points** on registration
- Level-based discount rates:
  - Lv1 (0 pts): 0%
  - Lv2 (5,000 pts): 2%
  - Lv3 (10,000 pts): 5%
  - Lv4 (20,000 pts): 8%
  - Lv5 (50,000 pts): 12%
  - Lv6 (100,000 pts): 15%
- Discount applied automatically at order creation

### 2.5 User Profile Enhancement
- Balance display in nav bar + profile card
- Order history with status badges (pending / paid / cancelled / refunded)
- Pay button for pending orders
- Transaction ledger with type color coding (+green / -red)

### 2.6 E2E Stress Tests
- Mass registration: 10 sequential user signups
- Recharge flow: tier selection → submit → balance update
- Order flow: explore → detail → create order → pay
- Profile verification: orders + transactions visible

---

## 3. Security Measures

| Risk | Mitigation |
|------|-----------|
| Race condition on payment | SQLite transaction + `BEGIN IMMEDIATE` equivalent via WAL |
| Negative balance | Checked before deduct; returns `402 Payment Required` |
| Order tampering | `Pay()` verifies `order.UserID == userID` inside transaction |
| Price manipulation | `unit_price` snapshotted at order creation time |
| SQL injection | All queries parameterized |

---

## 4. Test Results

```
Go tests:    43 tests, all green (go test ./...)
E2E tests:   29 tests, all green (npx playwright test)
```

---

## 5. Replay Instructions

```bash
cd /Users/nihao/Documents/100-journeys
go test ./...
cd e2e && npx playwright test
```

---

## 6. Next

- [ ] Add Go unit tests for order_repo + payment_handler
- [ ] Industrialize README (badges, screenshots, ER diagram)
- [ ] Deploy to GitHub Pages
- [ ] Merge `dev/v1.1.0` → `main`
