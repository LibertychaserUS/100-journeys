# Current State — 100 Journeys
> Always reflects the latest stable state. Overwritten at each checkpoint.

---

## Phase
**Phase 0 — Skeleton**
**Git tag**: `v0.0.0-skeleton`
**Checkpoint**: `checkpoints/CP-000-skeleton.md`
**Date**: 2025-01-01

## Build Status
| Item               | Status  |
|--------------------|---------|
| Go module init     | ⏳ Pending (Go not yet installed) |
| Frontend scaffold  | ✅      |
| DB schema          | ✅      |
| Seed data          | ✅      |
| API contract draft | ✅      |
| Git initialized    | ✅      |

## Active Blockers
- Go not installed on machine → run `brew install go` then `go mod init`

## Next Action
Start **Phase 1 — SDD**:
1. Install Go + run `go mod tidy`
2. Implement SQLite repository
3. Wire up Gin handlers
4. Validate API contract against live server
