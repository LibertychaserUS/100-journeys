# Test-Driven Development Specification — TDD
**Standard**: ISO/IEC/IEEE 29119-3 — Test Documentation
**Project**: 100 Journeys Web App MVP
**Phase**: TDD + E2E + Stress
**Status**: Updated for production-readiness branch

---

## 1. Test Strategy (ISO/IEC/IEEE 29119-2 §7)

### 1.1 Approach
**Red → Green → Refactor** strictly enforced:
1. Write failing test first
2. Write minimum code to pass
3. Refactor without breaking tests

### 1.2 Test Levels

| Level | Scope | Tool | Location |
|---|---|---|---|
| Unit | Repository, Service logic | Go `testing` | `tests/unit/` |
| Integration | Handler + real SQLite DB | Go `httptest` + `testing` | `tests/integration/` |
| E2E | Full browser user flows | Playwright | `e2e/` |
| Stress | High-concurrency capacity checks | Go `testing` with `stress` build tag | `tests/stress/` |
| Load | Runtime HTTP load profile | k6 | `tests/load/` |

---

## 2. Test Plan (ISO/IEC/IEEE 29119-3 §7)

### 2.1 Unit Test Cases — Repository Layer

| Test ID | Function | Input | Expected |
|---|---|---|---|
| UT-REPO-001 | `List()` | no filter | returns all 5 seed journeys |
| UT-REPO-002 | `List()` | tag=extreme | returns journeys tagged 极限挑战 |
| UT-REPO-003 | `List()` | adventure_min=8 | returns journeys with index ≥ 8 |
| UT-REPO-004 | `List()` | visual_style=surreal | returns surreal journeys only |
| UT-REPO-005 | `List()` | page=1, limit=2 | returns 2 journeys, total=5 |
| UT-REPO-006 | `GetBySlug()` | valid slug | returns journey with tags |
| UT-REPO-007 | `GetBySlug()` | invalid slug | returns ErrNotFound |
| UT-REPO-008 | `ListTags()` | — | returns all 8 tags |

### 2.2 Unit Test Cases — Service Layer

| Test ID | Function | Input | Expected |
|---|---|---|---|
| UT-SVC-001 | `ListJourneys()` | default filter | image_url resolved via MediaProvider |
| UT-SVC-002 | `ListJourneys()` | limit=0 | defaults to 12 |
| UT-SVC-003 | `GetJourney()` | valid slug | image_url resolved |
| UT-SVC-004 | `GetJourney()` | invalid slug | propagates error |

### 2.3 Integration Test Cases — API Handlers

| Test ID | Endpoint | Scenario | Expected Status | Expected Body |
|---|---|---|---|---|
| IT-API-001 | GET /api/health | nominal | 200 | `{"status":"ok"}` |
| IT-API-002 | GET /api/journeys | no params | 200 | 5 journeys, total=5 |
| IT-API-003 | GET /api/journeys | ?tag=extreme | 200 | filtered journeys |
| IT-API-004 | GET /api/journeys | ?limit=2&page=1 | 200 | 2 journeys |
| IT-API-005 | GET /api/journeys/:slug | valid slug | 200 | journey with story+tags |
| IT-API-006 | GET /api/journeys/:slug | invalid slug | 404 | `{"error":"journey not found"}` |
| IT-API-007 | GET /api/tags | — | 200 | 8 tags |
| IT-API-008 | GET /api/journeys | ?adventure_min=9 | 200 | only index≥9 journeys |

### 2.4 E2E Test Cases — User Flows

| Test ID | Flow | Steps | Assert |
|---|---|---|---|
| E2E-HOME-001 | Landing | Load `/#/` | Hero visible, ≥1 featured card |
| E2E-HOME-002 | Navigate to Explore | Click "探索" nav | URL = `#/explore`, cards visible |
| E2E-EXPLORE-001 | Browse | Load `/#/explore` | ≥5 journey cards rendered |
| E2E-EXPLORE-002 | Tag filter | Click tag chip | Card list updates |
| E2E-EXPLORE-003 | Adventure filter | Move slider to 8 | Only high-adventure cards shown |
| E2E-DETAIL-001 | Open detail | Click journey card | URL = `#/journey/:slug`, story visible |
| E2E-DETAIL-002 | Back navigation | Browser back | Returns to explore with filter preserved |

### 2.5 Stress Test Cases — Production Readiness

| Test ID | Function | Input | Expected |
|---|---|---|---|
| STRESS-PUBLIC-001 | Public browse API | `STRESS_PUBLIC_REQUESTS=3000` | health/tags/list/search/detail return 200 |
| STRESS-BUFFER-001 | Analytics buffer burst | `STRESS_ANALYTICS_EVENTS=20000` | no event drop; all events persisted after flush |
| STRESS-ORDER-001 | P0 order payment | `STRESS_USERS=100`, `STRESS_ORDERS=500` | paid orders = purchase transactions = 500 |
| STRESS-ADMIN-001 | Dashboard stats | `STRESS_ADMIN_REQUESTS=300` | admin stats return 200 and export succeeds |
| STRESS-IMAGE-001 | Static image delivery | `STRESS_IMAGE_REQUESTS=2000` | local static images return 200 and cache headers |
| STRESS-IMAGE-002 | Static image saturation | `STRESS_IMAGE_REQUESTS=3000` | expected to expose Go-static bottleneck if no CDN/Nginx |

### 2.6 TDD Red/Green Records

| Date | Test ID | Red Result | Green Result | Code Change |
|---|---|---|---|---|
| 2026-05-14 | STRESS-BUFFER-001 | event 8192 dropped with old capacity | `ok .../tests/stress 3.513s` for 20000 events | default analytics buffer capacity 32768, batch 512 |
| 2026-05-14 | UT-BUFFER-002 | `TestBufferDefaultOptionsAcceptFiveFigureBurstWithoutDrop` failed at event 8192 | `ok .../internal/analytics 2.645s` | default options increased and cleanup timeout adjusted |

---

## 3. Test Environment

```
OS:       macOS (Darwin)
Go:       1.22+
Node:     (for Playwright E2E)
DB:       In-memory SQLite (unit) / file SQLite with seed (integration)
Browser:  Chromium via Playwright
```

---

## 4. Coverage Requirements

| Layer | Minimum Coverage |
|---|---|
| Repository | 90% line |
| Service | 85% line |
| Handler | 80% line (via integration) |
| E2E flows | 100% of listed test cases |
| Stress target matrix | P0/P1 target profile passing |
| Buffer burst | 20,000 instantaneous P2 events accepted without drop |

---

## 5. TDD Phase Gate Checklist

- [ ] All UT-REPO-* tests written BEFORE repository implementation
- [ ] All UT-SVC-* tests written BEFORE service implementation
- [ ] All IT-API-* tests written BEFORE handler wiring
- [ ] Unit tests: all passing, coverage ≥ targets
- [ ] Integration tests: all passing against real SQLite + seed data
- [ ] E2E tests: all 7 cases passing (Playwright)
- [x] Buffer burst RED observed before capacity change
- [x] Buffer burst GREEN observed after capacity change
- [x] P0 order stress: 100 users / 500 orders
- [x] Combined medium-site stress profile passed with image request limit 2000
- [ ] Static image delivery at 3000 concurrent requests requires CDN/Nginx mitigation
- [ ] `go test ./...` exits 0
- [ ] Coverage report generated
- [ ] Prompt log Phase 3 + 4 entries written
- [ ] CP-TDD-001 + CP-E2E-001 checkpoints created
- [ ] `v0.3.0-tdd` + `v1.0.0` git tags created
