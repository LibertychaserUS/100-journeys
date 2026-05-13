# Current State — 100 Journeys
> Always reflects the latest stable state. Overwritten at each checkpoint.

---

## Phase
**Phase 5 — Feature Expansion v1.1.0** ✅ COMPLETE
**Git tag**: `v1.1.0`
**Checkpoint**: `checkpoints/CP-v1.1.0-features.md`
**Date**: 2026-05-13
**Branch**: `dev/v1.1.0`

## Build Status
| Item | Status |
|------|--------|
| Go backend | ✅ `go build ./cmd/server/` passes |
| Go tests | ✅ `go test ./...` — 51 tests, all green |
| E2E tests | ✅ `npx playwright test` — 29 tests, all green |
| Frontend (Home/Explore/Detail/Profile/Recharge) | ✅ |
| AI Pet | ✅ |
| DB schema + seed (v1.1) | ✅ |
| Order & Payment system | ✅ |
| Points & Level system | ✅ |
| Virtual currency (不思议币) | ✅ |

## Coverage Report
| Package | Coverage | Target |
|---------|----------|--------|
| `internal/repository` | 84.2% | ≥ 80% ✅ |
| `internal/service` | 83.3% | ≥ 80% ✅ |
| `internal/ai` | 84.0% | ≥ 80% ✅ |
| `internal/handler` | 78.6% | ≥ 70% ✅ |

## E2E Test Results
| Flow | Tests | Status |
|---|---|---|
| Home | 5 | ✅ |
| Explore | 6 | ✅ |
| Detail | 6 | ✅ |
| Auth | 8 | ✅ |
| Order & Payment | 5 | ✅ |
| **Total** | **29** | **✅ 100%** |

## Features v1.1.0
| Feature | Description |
|---------|-------------|
| Unique order numbers | `JNY` + timestamp + random |
| Multi-item orders | Bulk checkout with `[]CreateOrderItem` |
| Atomic payment | SQLite transaction: verify → deduct → ledger → mark paid |
| Recharge tiers | 7 tiers (60–9,980) with bonuses up to 2,888 |
| Journey pricing | 5 journeys priced 8,999–29,999 |
| Points & levels | 5,000 welcome points; Lv1–Lv6 discounts 0%–15% |
| Audit trail | `transactions` table records every balance change |

## Active Blockers
- None

## Next Action
- Industrialize README + deploy to GitHub Pages
- Merge `dev/v1.1.0` → `main`
