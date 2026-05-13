# Current State — 100 Journeys
> Always reflects the latest stable state. Overwritten at each checkpoint.

---

## Phase
**Phase 4 — E2E (End-to-End Testing)** ✅ COMPLETE
**Git tag**: `v1.0.0`
**Checkpoint**: `checkpoints/CP-E2E-001.md`
**Date**: 2026-05-13

## Build Status
| Item | Status |
|------|--------|
| Go backend | ✅ `go build ./cmd/server/` passes |
| Go tests | ✅ `go test ./...` — 43 tests, all green |
| E2E tests | ✅ `npx playwright test` — 17 tests, all green |
| Frontend (Home/Explore/Detail) | ✅ |
| AI Pet | ✅ |
| DB schema + seed | ✅ |
| Git tags | `v0.0.0-skeleton` → `v0.3.0-tdd` → `v1.0.0` |

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
| **Total** | **17** | **✅ 100%** |

## Worktree Branches
| Directory | Branch | Purpose |
|-----------|--------|---------|
| `100-journeys/` | `main` | MVP 版本推进 |
| `.worktrees/frontend-dev/` | `frontend-dev` | 前端开发 |
| `.worktrees/backend-dev/` | `backend-dev` | 后端开发 |
| `.worktrees/sql-dev/` | `sql-dev` | 数据库/schema |
| `.worktrees/doc-trace/` | `doc-trace` | 文档/trace |

## Critical Bugs Fixed in This Phase
1. **Router query string parsing** — `/#/explore?q=x` fell back to Home (hash included `?` in path)
2. **Detail API envelope unwrapping** — `_renderPage` received `{data: journey}` instead of `journey`
3. **`const Pages` redeclaration** — multiple script tags share scope in Chromium
4. **Router `this` context loss** — unbound method references
5. **Seed tag slug mismatch** — Chinese names vs English slugs in `journey_tags`

## Active Blockers
- None

## Next Action
- Project complete. Optional: push to remote, CodeRabbit review, deploy.
