# Development Log — 100 Journeys
> Main running log. Append only. One entry per phase/milestone.
> Full audit trail: this file + checkpoints/ + git tags + docs/prompts/

---

## Log Format

```
### [PHASE] [STAGE] — [DATE]
**Git tag**: vX.Y.Z-[phase]
**Checkpoint**: checkpoints/CP-[ID].md
**Agent**: Main | Sub:[name]
**Status**: ✅ Complete | 🔄 In Progress | ❌ Blocked

#### Done
- ...

#### Decisions
- ...

#### Next
- ...
```

---

## Phase 0 — Skeleton | 2025-01-01

**Git tag**: `v0.0.0-skeleton`
**Checkpoint**: `checkpoints/CP-000-skeleton.md`
**Agent**: Main
**Status**: ✅ Complete

#### Done
- Full directory structure: cmd, internal, db, web, docs, trace, tests, e2e
- CSS design token system (tokens → global → layout → components → pages)
- Hash SPA router scaffold
- CDN-ready MediaProvider interface (window.APP_CONFIG injection)
- Database schema: journeys + tags + journey_tags (normalized, indexed)
- 5 seed journeys with tag associations
- API contract draft (ISO/IEC/IEEE 29148:2018)
- Test plan draft (ISO/IEC/IEEE 29119-3)
- Go model + repository interface + service skeleton + handler stubs
- Multi-agent workflow doc + full trace/checkpoint system

#### Decisions
- SQLite via modernc.org/sqlite (pure Go, no CGO)
- Gin framework
- Hash routing (no server-side fallback needed)
- Tag normalization: journey_tags join table instead of JSON column
- CDN switch: server-side config only, frontend reads window.APP_CONFIG.mediaBase
- IEEE standards: 29148:2018 (SDD), 1016-2009 (DDD), 29119 (TDD/E2E)
- Checkpoint format: CP file + DEVELOPMENT_LOG entry + git tag (triple)

#### Next
- Phase 1: SDD — finalize API contract, data models, Go module init, repo impl
