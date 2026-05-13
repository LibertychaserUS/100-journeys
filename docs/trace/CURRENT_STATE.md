# Current State — 100 Journeys
> Always reflects the latest stable state. Overwritten at each checkpoint.

---

## Phase
**Phase 2 — DDD (Design-Driven Development)**
**Git tag**: `v0.2.0-ddd`
**Checkpoint**: `checkpoints/CP-DDD-001.md`
**Date**: 2026-05-13

## Build Status
| Item | Status |
|------|--------|
| Go backend | ✅ `go build ./cmd/server/` passes |
| Frontend (Home) | ✅ |
| Frontend (Explore) | ✅ |
| Frontend (Detail) | ✅ |
| AI Pet | ✅ |
| DB schema + seed | ✅ |
| API contract | ✅ |
| Git tags | `v0.0.0-skeleton`, `v0.1.0-sdd`, `v0.2.0-ddd` |

## Worktree Branches
| Directory | Branch | Purpose |
|-----------|--------|---------|
| `100-journeys/` | `main` | MVP 版本推进 |
| `.worktrees/frontend-dev/` | `frontend-dev` | 前端开发 |
| `.worktrees/backend-dev/` | `backend-dev` | 后端开发 |
| `.worktrees/sql-dev/` | `sql-dev` | 数据库/schema |
| `.worktrees/doc-trace/` | `doc-trace` | 文档/trace |

## Active Blockers
- None

## Next Action
Start **Phase 3 — TDD**:
1. Write `docs/testing/TDD-spec.md` — test plan (ISO/IEC/IEEE 29119-3)
2. Unit tests: `tests/unit/` — repository + service
3. Integration tests: `tests/integration/` — httptest for all API endpoints
4. Run `go test ./...` and ensure all pass
