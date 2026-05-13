# Checkpoint CP-TDD-001 — Phase 3: Test-Driven Development

**Date**: 2026-05-13
**Git tag**: `v0.3.0-tdd`
**Commit**: `4481ed3`
**Agent**: Main
**Status**: Complete

---

## Phase Gate Checklist (ISO/IEC/IEEE 29119-3)

| Item | Requirement | Status |
|------|-------------|--------|
| Test plan | Scope, approach, environment documented | ✅ |
| Unit tests | Repository + Service + AI | ✅ |
| Integration tests | HTTP handlers via httptest | ✅ |
| Coverage targets | All packages meet thresholds | ✅ |
| `go test ./...` | Exits 0 | ✅ |

---

## Test Coverage Report

| Package | Tests | Coverage | Target |
|---------|-------|----------|--------|
| `internal/repository` | 11 | 84.2% | ≥ 80% ✅ |
| `internal/service` | 9 | 83.3% | ≥ 80% ✅ |
| `internal/ai` | 10 | 84.0% | ≥ 80% ✅ |
| `internal/handler` | 13 | 78.6% | ≥ 70% ✅ |

**Total**: 43 tests, all passing.

---

## Files Added

| File | Tests | Coverage |
|------|-------|----------|
| `internal/repository/journey_repo_sqlite_test.go` | UT-REPO-001 ~ 011 | 84.2% |
| `internal/service/journey_service_test.go` | UT-SVC-001 ~ 009 | 83.3% |
| `internal/ai/mock_ai_test.go` | UT-AI-001 ~ 005 | — |
| `internal/ai/recommend_engine_test.go` | UT-ENG-001 ~ 005 | — |
| `internal/handler/journey_handler_test.go` | IT-API-001 ~ 013 | 78.6% |

---

## Bug Fixes Found During TDD

1. **seed.sql journey_tags**: INSERT statements used Chinese tag names (`'孤独感'`) in `t.slug IN (...)` but actual slugs are English (`'solitude'`). Fixed to use correct English slugs.
2. **db.go testability**: `Migrate`/`Seed` hardcoded `"db/schema.sql"` paths. Changed to accept path parameters so tests can run from any package directory.

---

## Test Design Decisions

- **In-memory SQLite**: Each test creates fresh `:memory:` DB with schema + seed. No test pollution.
- **Hand-rolled mocks**: No external mock library (gomock, testify/mock). Simple struct overrides for interface methods.
- **Gin test mode**: Suppresses log noise in handler tests.
- **Test helpers**: `setupTestDB()` and `setupTestRouter()` DRY up repetitive setup.

---

## Replay Instructions

```bash
cd /Users/nihao/Documents/100-journeys
git checkout v0.3.0-tdd
go test ./...
go test -cover ./...
```

---

## Known Issues / Next Phase Input

- **E2E tests** (Phase 4): Playwright browser automation for Home → Explore → Detail flows. Not yet implemented.
- **cmd/server**: No tests for `main()` wiring. Acceptable per MVP scope — integration tests cover all handlers.
