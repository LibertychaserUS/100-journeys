# Checkpoint CP-000 — Skeleton
**Phase**: 0 — Project Initialization
**Git tag**: `v0.0.0-skeleton`
**Date**: 2025-01-01
**Agent**: Main

---

## Snapshot

### Files Created (33)
```
.gitignore
README.md
cmd/server/main.go
db/schema.sql
db/seed.sql
docs/prompts/prompt-log.md
docs/schema/api-contract.md
docs/testing/test-plan.md
e2e/.gitkeep
internal/handler/journey_handler.go
internal/model/journey.go
internal/repository/journey_repo.go
internal/service/journey_service.go
tests/integration/.gitkeep
tests/unit/.gitkeep
web/assets/images/.gitkeep
web/css/components/card.css   [stub]
web/css/components/filter.css [stub]
web/css/components/hero.css   [stub]
web/css/components/nav.css    [stub]
web/css/global.css
web/css/layout.css
web/css/pages/detail.css      [stub]
web/css/pages/explore.css     [stub]
web/css/pages/home.css        [stub]
web/css/tokens.css
web/index.html
web/js/api.js
web/js/config.js
web/js/pages/detail.js        [stub]
web/js/pages/explore.js       [stub]
web/js/pages/home.js          [stub]
web/js/router.js
trace/DEVELOPMENT_LOG.md
trace/CURRENT_STATE.md
trace/checkpoints/CP-000-skeleton.md
docs/workflow/multi-agent-workflow.md
```

### Architecture Decisions Locked
| Decision | Choice | Rationale |
|---|---|---|
| Backend | Go + Gin | Fast compile, single binary |
| DB | SQLite + modernc | Pure Go, no CGO |
| Frontend | Vanilla JS + Hash routing | No framework deps |
| Tag storage | Normalized join table | Filterable without JSON LIKE |
| CDN interface | window.APP_CONFIG injection | Zero frontend change for CDN swap |
| Standards | IEEE 29148 / 1016 / 29119 | Industry compliance per assignment |
| Checkpoint format | File + Log + Tag (triple) | Full auditability |

### Phase Gate Criteria (met to proceed to SDD)
- [x] Directory structure complete
- [x] Git initialized and committed
- [x] Schema designed and validated (normalized)
- [x] API contract drafted
- [x] Workflow documented
- [ ] Go installed + go.mod initialized ← **prerequisite for Phase 1**

---

## Replay Instructions
```bash
git checkout v0.0.0-skeleton
```
State is fully reproducible from this tag.
