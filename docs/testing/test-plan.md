# Test Plan — 100 Journeys
**Standard**: ISO/IEC/IEEE 29119-3 (Test Documentation)
**Phase**: TDD + E2E
**Status**: DRAFT

---

## 1. Test Scope

| Level        | Target                        | Tool               |
|--------------|-------------------------------|--------------------|
| Unit         | Repository, Service layer     | Go `testing`       |
| Integration  | Handler + DB (real SQLite)    | Go `httptest`      |
| E2E          | Full user flows via browser   | Playwright         |

## 2. Test IDs

Format: `[LEVEL]-[MODULE]-[NNN]`
- `UT-REPO-001` Unit test, repository, #001
- `IT-API-001`  Integration test, API, #001
- `E2E-HOME-001` E2E, home page, #001

## 3. Coverage Targets
- Unit:        ≥ 80% line coverage on service + repository
- Integration: All API endpoints × happy path + error cases
- E2E:         3 core user flows (browse → filter → detail)

## 4. Test Cases (to be expanded in TDD phase)
See `tests/unit/` and `tests/integration/` for implementation.
