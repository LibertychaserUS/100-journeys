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

---

## Phase 1 — SDD | 2026-05-12

**Git tag**: `v0.1.0-sdd`
**Checkpoint**: `checkpoints/CP-SDD-001.md`
**Agent**: Main + Sub:backend
**Status**: Complete

#### Done
- Go 1.26 installed, module initialized (`go mod init github.com/100-journeys/app`)
- Dependencies: `gin-gonic/gin`, `gin-contrib/cors`, `modernc.org/sqlite`
- Database schema v1.1: journeys + tags + journey_tags + mbti_types + journey_mbti + ai_logs
- New fields: story_hook, fantasy_type, risk_level, mood_keywords, booking_url
- SQLite repository: parameterized queries, filtering by tag/visual_style/fantasy_type/adventure/obscurity/MBTI
- Service layer: MediaProvider interface (CDN-ready), JourneyService
- Gin handlers: 7 API endpoints with standard envelope `{ data, error, total?, page?, limit? }`
- CORS configured, static files served, SPA fallback with APP_CONFIG injection
- `db/seed.sql`: 5 journeys, 8 tags, 16 MBTI types, compatibility associations
- `docs/schema/SDD-spec.md` + `api-contract.md` finalized

#### Decisions
- `modernc.org/sqlite` confirmed as pure Go (no CGO), builds cleanly
- `//go:embed` replaced with `os.ReadFile` for schema/seed loading (path resolution issue)
- HTTPS push via `gh auth setup-git` (SSH deploy key not available)
- Worktrees: main + frontend-dev + backend-dev + sql-dev + doc-trace

#### Next
- Phase 2: DDD — UI/UX implementation, AI Pet, responsive pages

---

## Phase 2 — DDD | 2026-05-13

**Git tag**: `v0.2.0-ddd`
**Checkpoint**: `checkpoints/CP-DDD-001.md`
**Agent**: Main + Sub:frontend
**Status**: Complete

#### Done
- **Home page**: hero (100vh, fade-up animation), MBTI teaser scroll, featured 6-card grid with staggered entrance
- **Explore page**: search bar (300ms debounce), filter chips (fantasy_type, visual_style), adventure slider (1-10), masonry card grid, pagination, skeleton loading
- **Detail page**: full-bleed hero (40vh) with parallax, gradient overlay, back/share buttons, fantasy type badge, story hook quote, meta row (region/duration/cost), tags + MBTI chips with compatibility scores, mood keywords, story text with visual_style typography overrides, clue reveal (IntersectionObserver blur→clear), booking CTA, save toggle
- **AI Pet**: 8-bit pixel art CSS avatar (dog/cat), localStorage profile, weighted MBTI quiz (5 questions, all 4 dimensions scored per option), rule-based mock AI engine, chat panel, setup modal, idle trigger (10s / 3 page views)
- **Router**: hash-based SPA — `/`, `/explore`, `/journey/:slug`
- **CSS layer order**: tokens → global → layout → components → pages
- **Animations**: only transform/opacity, cubic-bezier easing, 60fps target
- **Responsive**: 375px → 768px → 1024px → 1280px breakpoints
- **Worktree branches**: all 5 branches rebased to latest main, pushed to origin

#### Decisions
- Vanilla JS — zero bundle size, no framework lock-in
- Skeleton loading instead of spinner for perceived performance
- MBTI tie-breaker defaults to I/N/F/P (traveler bias)
- All SVG icons inline (no external dependencies)

#### Next
- Phase 3: TDD — unit tests (repository + service), integration tests (httptest), test plan documentation

---

## Phase 3 — TDD | 2026-05-13

**Git tag**: `v0.3.0-tdd`
**Checkpoint**: `checkpoints/CP-TDD-001.md`
**Agent**: Main
**Status**: Complete

#### Done
- `docs/testing/TDD-spec.md` updated — ISO/IEC/IEEE 29119-3 test plan with 43 test cases
- Repository tests (11): List filters (tag, visual_style, fantasy_type, adventure range, MBTI), pagination, GetBySlug exists/not-found, ListTags, ListMBTITypes
- Service tests (9): default pagination, image URL resolution, GetJourney exists/not-found/error, ListTags, ListMBTITypes, GetBookingInfo
- AI tests (10): mock chat (recommend, MBTI, greeting, risk, fallback), recommend engine (MBTI scoring, keyword matching, fallback, limit, no-match)
- Handler integration tests (13): all 7 API endpoints × happy path + error cases
- Coverage: repository 84.2%, service 83.3%, ai 84.0%, handler 78.6% — all meet targets
- Bug found + fixed: seed.sql journey_tags used Chinese names instead of English slugs
- Bug found + fixed: db.Migrate/Seed hardcoded paths — changed to accept parameters

#### Decisions
- Hand-rolled mocks (no external mock library) to minimize dependencies
- Fresh `:memory:` DB per test — zero pollution, parallel-safe
- `gin.TestMode()` for silent handler tests

#### Next
- Phase 4: E2E — Playwright browser automation for core user flows
