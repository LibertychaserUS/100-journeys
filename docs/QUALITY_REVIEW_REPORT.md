# Quality Review Report — 100 Journeys

**Date**: 2026-05-13  
**Reviewer**: Engineering QA Review  
**Scope**: Audit/report only. No production source code, test code, schema, or existing maintained project docs were modified in this pass.  
**Readiness judgment**: **Not ready for submission** until E2E failures, stale documentation, product-model gaps, and deployment mismatch are fixed.

---

## 1. Review Summary

This repository is a Go + Gin + SQLite backend with a vanilla HTML/CSS/JS hash-routed SPA frontend. It has meaningful existing work from prior AI-assisted passes and handoff materials: seed data, image assets, a Go API, authentication, order/payment simulation, Playwright tests, and trace docs.

However, the current project state does not match several submission claims:

- README, `docs/HANDOFF.md`, and `docs/trace/CURRENT_STATE.md` claim E2E is fully green, but local verification shows **15 passed / 14 failed**.
- Coverage numbers in README/current-state docs are higher than current `go test -cover ./...` output.
- SDD/DDD/TDD docs are incomplete or stale relative to the implemented user/auth/order/admin scope.
- The core product still reads partly like a travel-destination showcase, not a role-based fantasy journey / mission-board product.
- Deployment workflow currently uploads only `./web` to GitHub Pages, which cannot run the Go API or SQLite backend.

The codebase is usable as a base for targeted repair. It should not be rewritten blindly, but a significant frontend redesign is reasonable. The user has now allowed a React rewrite if needed; this conflicts with the current local project constraint that describes the frontend as vanilla HTML/CSS/JS, so that decision must be explicitly documented before implementation.

---

## 2. Commands Run

| Command | Result |
|---|---|
| `git status --short` | Shows one untracked local instruction file before this report. It should not be included in the public submission unless intentionally approved. |
| `go test ./...` | Passes. Packages with tests under `internal/ai`, `internal/handler`, `internal/middleware`, `internal/repository`, and `internal/service` pass. |
| `go vet ./...` | Passes with no reported issues. |
| `go test -cover ./...` | Passes, but coverage is lower than docs claim: `internal/ai` 84.0%, `internal/handler` 65.3%, `internal/middleware` 74.7%, `internal/repository` 71.0%, `internal/service` 32.5%. |
| `go test -race ./...` | Failed at build/toolchain level with `package github.com/100-journeys/app/cmd/server: cannot find package` and package build failures. Needs separate environment/toolchain investigation. |
| `npx playwright test` inside sandbox | Failed 29/29 because Chromium could not launch: `bootstrap_check_in ... Permission denied (1100)`. This was an environment false failure. |
| `npx playwright test` outside sandbox | Ran real browser E2E. Result: **15 passed / 14 failed**. |
| `coderabbit --version` | `0.4.1`. |
| `coderabbit auth status --agent` | Authenticated successfully through the configured GitHub account. |
| `coderabbit review --agent -t all` | Failed: `Review failed: No files to review`. |
| `coderabbit review --agent --base-commit 705280ddb0de20879c902a9764ded274848c5721` | Failed: `Review failed: Unknown error`, `TRPCClientError`. |
| Local visual screenshot via Playwright | Captured homepage screenshots to `/private/tmp/100-journeys-home.png` and `/private/tmp/100-journeys-home-skip-pet.png`; not committed. |

---

## 3. CodeRabbit Result

CodeRabbit did not produce review findings.

1. Default all-scope review failed because there were no tracked files to review against the default diff scope:

```text
Review failed: No files to review
```

2. A root-to-current review attempt using the first commit as base failed in the service:

```text
Review failed: Unknown error
TRPCClientError
```

No manual finding in this report should be represented as a CodeRabbit finding.

---

## 4. Major Findings

### Critical: Documentation overstates verification status

README, HANDOFF, and CURRENT_STATE report all E2E tests as passing. The current local result is **15/29 passing** after rerunning Playwright outside the sandbox. The failing cases include auth, order/payment, homepage assumptions, and load-more pagination.

Impact:
- Submission evidence would be misleading if left unchanged.
- Future maintainers may trust false green status and skip necessary fixes.

Required fix:
- Update README, HANDOFF, CURRENT_STATE, DEVELOPMENT_LOG, and test report with exact current results.
- Do not claim all green until `npx playwright test` passes in a real browser environment.

### Critical: SDD/product schema is missing required fantasy-mission fields

The current `Journey` model includes title, slug, story, region, fantasy type, visual style, risk/adventure fields, mood keywords, image URL, price, tags, and MBTI mappings. It does not include role identity, mission goal, clues, highlights, risks list, preparation list, target users, or structured persona/mood arrays.

Evidence:
- `internal/model/journey.go:5-27` has no `role`, `mission`, `clues`, `highlights`, `risks`, or `preparation`.
- `db/schema.sql` also lacks those structured columns.

Impact:
- The detail page cannot fully satisfy the assignment requirement for script-killing / escape-room-like story missions.
- Existing sample data is emotionally written but still mostly real-world destination travel.

Required fix:
- Extend SDD and schema first.
- Add JSON-text columns for MVP: `role`, `mission`, `clues`, `highlights`, `risks`, `preparation`, `target_users`, and optionally `persona_tags`.
- Update seed data so at least 5 entries read like role-based fantasy journeys, not generic destination listings.

### Critical: Current deployment workflow cannot deploy the full app

`.github/workflows/pages.yml:30-33` uploads only `./web` to GitHub Pages. The frontend depends on `/api` endpoints served by the Go process and SQLite-backed data.

Impact:
- A GitHub Pages deployment would be a static shell without backend API support.
- The project is not actually deployable as a full-stack app through the current workflow.

Required fix:
- Document GitHub Pages as static-preview-only, or replace with a backend-capable deployment plan.
- For full-stack deployment, use a VPS/container/Fly.io/Render/Railway-style Go service with persistent SQLite volume, or split static assets from API intentionally.
- If using Vercel, this Go binary + SQLite architecture is not a natural fit without redesigning the backend deployment model.

### Major: Auth/order E2E tests are stale after captcha was added

The auth and order tests fill username/email/password but do not solve the math captcha. Failures then cascade into hidden nav controls and order/payment flows.

Observed failures:
- Register redirect expected `/#/`, received `/#/register`.
- Login wrong-password expected visible error, but submit did not reach the intended backend path.
- Logout/profile nav buttons remained hidden.
- Order/recharge tests failed at helper registration.

Required fix:
- Add a shared Playwright helper that reads the displayed captcha expression or calls `/api/captcha`, fills the answer, and waits for nav state after login/register.
- Re-run the full suite and update docs with the real result.

### Major: Search/filter UI sends values the backend does not support

Frontend Explore sends:
- `q` from search input.
- Chinese `visual_style` values such as `写实`, `动漫`, `油画`.
- Chinese `fantasy_type` values such as `科幻`, `奇幻`, `武侠`.
- Tag display names from `/api/tags`.

Backend filter supports:
- no `q` field in `JourneyFilter`.
- `visual_style` DB enum values like `raw`, `surreal`, `minimal`, `dramatic`.
- `fantasy_type` DB enum values like `extreme`, `solitude`, `visual`, `culture`, `spiritual`, `night`.
- tag slug through SQL condition `t.slug = ?`.

Evidence:
- `web/js/pages/explore.js:40-52` emits `q`.
- `web/js/pages/explore.js:69-70` defines Chinese visual/fantasy values.
- `internal/model/journey.go:49-58` has no `q`.

Impact:
- Search may appear to update but is not truly implemented server-side.
- Several filters can return empty or misleading results.
- Current E2E only checks that UI text exists, not that filtering is semantically correct.

Required fix:
- Decide canonical filter values in SDD/API docs.
- Either map frontend labels to backend enum slugs or migrate DB enums to user-facing taxonomy.
- Add integration tests asserting actual filtered results.

### Major: First-time modal blocks product understanding

The first visit shows the AI pet adoption modal before the user can see the hero or core product proposition. Visual QA showed the modal obscuring the first viewport.

Impact:
- Fails the requirement that a first-time visitor should understand the fantasy travel concept within seconds.
- The AI companion becomes a blocker instead of an enhancement.

Required fix:
- Defer AI pet onboarding until after the user scrolls/clicks, or make it a non-blocking corner prompt.
- Ensure the homepage first viewport includes search/mood/personality discovery controls.

### Major: Admin endpoints are placeholders

Evidence:
- `internal/handler/admin_handler.go:21-24` returns an empty user array.
- `internal/handler/admin_handler.go:27-34` hardcodes `total_users: 0`, `total_journeys: 5`, `total_points: 0`.

Impact:
- Admin dashboard is not real and should not be claimed as complete.

Required fix:
- Either remove admin from submission claims, or implement repository-backed stats/users with tests.

### Major: Save/favorite API is not implemented

Evidence:
- `internal/handler/auth_handler.go:160-164` returns HTTP 501 for `SaveJourney`.
- Detail page save button currently toggles client CSS state only.

Impact:
- Favorite/wishlist should be documented as local-only or completed end-to-end.

Required fix:
- For MVP, either implement localStorage favorites with clear docs, or wire authenticated save/unsave/list endpoints.

### Major: Session-storage auth token is ignored for API requests

Evidence:
- `web/js/api.js:80-88` can store tokens in `sessionStorage` when "remember me" is false.
- `web/js/api.js:39-42` only reads `localStorage` for the Authorization header.

Impact:
- Non-remembered login sessions can appear logged in via `isLoggedIn()` but authenticated requests may fail.

Required fix:
- Make `authHeader()` use `API.getToken()` behavior or check both storage locations.
- Add E2E coverage for remember-me disabled.

### Major: Production/security hardening is incomplete

Risks:
- `JWT_SECRET` defaults to a hardcoded development value.
- No API rate limiting.
- Captcha is in-memory and single-process only.
- Recharge amount is not capped beyond `min=1`.
- No graceful shutdown or server timeouts.
- Order number uses timestamp + nanosecond modulo; concurrency collision risk should be tested.

Required fix:
- Document deployment-only required env vars.
- Add rate limiting, request size limits, amount caps, and concurrency tests before claiming production readiness.

---

## 5. Product And Design Review

The current design is polished in parts: it uses real images, a cinematic hero, card grids, dark/light theme support, and route-level pages. But it still misses the required product positioning:

- Homepage does not show mood filters, MBTI filters, search, or discovery controls in the first viewport.
- Detail content is story text, not yet a mission document with role, mission, clues, preparation, and risk reminders.
- The product lacks the "What world do I want to enter?" framing.
- Canvas particle/starfield motion is missing.
- Current visual language is cinematic travel editorial, not yet a young-user fantasy mission-board / Xiaohongshu-inspired discovery product.

Updated user direction:
- A full visual redesign is allowed.
- React may be used if a rewrite is justified.
- Image-to-design generation is allowed for creating a design concept before implementation.

Constraint note:
- Current local project constraints describe the frontend as vanilla HTML/CSS/JS. If React is chosen, that must be treated as an explicit project-constraint change and recorded in the maintained trace docs before implementation.

Recommended design workflow:
1. Generate 2-3 image-based design concepts from the assignment screenshot and product requirements.
2. Choose one direction: fantasy mission board, immersive travel notebook, or story-card feed.
3. Update DDD before coding.
4. Implement either targeted vanilla redesign or React rewrite depending on agreed scope.
5. Validate desktop/mobile screenshots and console health.

Frontend design skill direction:
- Use the frontend design/build skill for the next visual pass, not ad hoc CSS patching.
- Generate a consistent image-based design system before coding. Required concept surfaces should include the homepage first viewport, Explore feed, journey detail page, AI pet appearance, AI pet onboarding modal, filter chips, journey cards, empty state, loading state, recharge/order widgets if retained, and mobile layout.
- Treat the AI pet as part of the product identity, not an unrelated floating toy. Its species, pixel/illustration style, colors, chat bubble, trigger badge, and recommendation cards should share the same visual language as the hero and journey cards.
- Use image-to-design input from the assignment screenshot and existing product requirements to keep the redesign aligned with the required "100种不可思议旅行" brief.
- Do not implement from generated images as static screenshots. Convert the chosen design into code-native UI: semantic HTML/components, real controls, real filters, real state, and responsive layouts.

---

## 6. Database And API Review

Current SQLite design is coherent for listing/detail/tag/MBTI/order/payment basics. It uses parameterized queries and `modernc.org/sqlite`.

Gaps:
- Missing mission/detail structured fields.
- Search query is not implemented.
- Tag filtering expects slug, while UI sends names.
- Docs still describe older endpoints and only 5 journeys in places.
- Admin and favorites are partially wired but not real.

Recommended schema extension for MVP:

```sql
ALTER TABLE journeys ADD COLUMN role TEXT;
ALTER TABLE journeys ADD COLUMN mission TEXT;
ALTER TABLE journeys ADD COLUMN clues TEXT;        -- JSON array
ALTER TABLE journeys ADD COLUMN highlights TEXT;   -- JSON array
ALTER TABLE journeys ADD COLUMN risks TEXT;        -- JSON array
ALTER TABLE journeys ADD COLUMN preparation TEXT;  -- JSON array
ALTER TABLE journeys ADD COLUMN target_users TEXT; -- JSON array
ALTER TABLE journeys ADD COLUMN persona_tags TEXT; -- JSON array
```

Before implementation, reflect this in:
- `docs/schema/SDD-spec.md`
- `docs/schema/api-contract.md`
- `db/schema.sql`
- `internal/model/journey.go`
- repository scan/write paths
- seed data
- detail page renderer
- integration/E2E tests

---

## 7. Documentation Review

Stale or incomplete docs:
- `docs/schema/SDD-spec.md:13-14` still says user accounts, bookmarks, comments, and admin CMS are out of scope even though auth/order/admin code exists.
- `docs/schema/SDD-spec.md` is marked DRAFT and does not cover current v1.2 features.
- `docs/schema/api-contract.md` lacks current auth/order/payment/admin endpoints in full detail.
- `docs/ui-components/DDD-spec.md` still says UIUXProMax output is pending.
- `docs/testing/TDD-spec.md` references old 5-journey assumptions.
- `docs/prompts/prompt-log.md` has placeholders for phases 1-4 and only records phase 5.
- `docs/workflow/SYSTEM-DAG.md` documents cache and external AI adapters that are not implemented.
- `README.md` and `docs/trace/CURRENT_STATE.md` should not claim all tests/coverage are green.
- `app.xlsx` test spreadsheet appears missing.

Required documentation pass:
- Replace false completion claims with verified results.
- Add a transparent prompt reconstruction section instead of fabricated historical prompts.
- Update SDD/DDD/TDD/API docs to match actual code and current assignment requirements.
- Add deployment limitations and concrete deployment path.
- Add this report to handoff materials.

---

## 8. Test Plan Additions

### E2E repair/additions

Add stable selectors where missing:
- `data-testid="journey-card"`
- `data-testid="search-input"`
- `data-testid="mood-filter"`
- `data-testid="persona-filter"`
- `data-testid="journey-detail"`
- `data-testid="empty-state"`
- `data-testid="captcha-question"`

Add/repair Playwright flows:

| Area | Scenario |
|---|---|
| Homepage | Hero explains fantasy travel concept without blocking modal. |
| Homepage | Search/mood/persona filters are visible in first meaningful screen or immediately below hero. |
| Explore | Search for known keyword narrows results to matching cards. |
| Explore | Unmatched keyword shows product-flavored empty state. |
| Explore | Mood/persona/fantasy filters use backend-supported values and produce correct results. |
| Detail | Detail page shows role, mission, clues, highlights, risks, preparation. |
| Auth | Captcha-aware register/login helpers. |
| Auth | Remember-me false still authenticates requests with sessionStorage token. |
| Orders | Recharge/order/pay happy path after captcha-aware login. |
| Admin | Non-admin gets 403; admin sees real stats if implemented. |
| Console | Main home/explore/detail flow has no relevant console errors. |

### Go integration tests

Add tests for:
- `GET /api/journeys?q=...` once implemented.
- tag slug vs display-name behavior.
- `fantasy_type` and `visual_style` canonical values.
- MBTI filter returns compatible journeys.
- pagination with 12 seed journeys.
- detail response includes mission/clues/risks/preparation.
- auth save/favorite endpoint if kept.
- admin stats/users if claimed.

### Security tests

Add tests for:
- missing/weak `JWT_SECRET` policy in production mode.
- recharge amount max cap.
- order ownership enforcement.
- duplicate payment/idempotency behavior.
- invalid quantity/order payloads.
- basic rate limit once middleware exists.

---

## 9. Pressure-Test Plan

The user requested both k6 and Go standard-library pressure tests.

### k6 production-style scripts

Recommended location after implementation:
- `load/k6/public_content.js`
- `load/k6/auth_order_flow.js`

Public scenario:
- `GET /api/health`
- `GET /api/tags`
- `GET /api/mbti`
- `GET /api/journeys?limit=12`
- `GET /api/journeys?mbti=INFP`
- `GET /api/journeys?tag=extreme`
- `GET /api/journeys/:slug`

Authenticated scenario:
- `GET /api/captcha`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/payments/recharge`
- `POST /api/orders`
- `POST /api/orders/:id/pay`
- `GET /api/orders`
- `GET /api/payments/transactions`

Suggested thresholds for local MVP:

```js
thresholds: {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<250'],
  checks: ['rate>0.99'],
}
```

For SQLite write contention, run a separate smaller authenticated scenario with controlled VUs before raising load. The goal is to discover locking/error behavior, not to pretend SQLite is horizontally scalable.

### Go stdlib benchmarks/load tests

Recommended tests:
- `BenchmarkJourneyRepositoryList`
- `BenchmarkJourneyRepositoryGetBySlug`
- `TestConcurrentRegisterLogin`
- `TestConcurrentRechargeAndPay`
- `TestOrderNumberUniquenessUnderConcurrency`

Implementation notes:
- Use temp DB files, not `data/app.db`.
- Run schema/seed per test.
- Use `httptest` for API-level concurrency.
- Use `sync.WaitGroup` and channels to collect errors.
- Include `go test -run TestConcurrent -count=1 ./internal/...` in docs.

---

## 10. Recommended Remediation Order

1. Make docs honest immediately: test status, coverage, deployment limits, prompt log authenticity.
2. Repair E2E helpers for captcha and update stale assertions.
3. Fix filter/search contract end-to-end with backend integration tests first.
4. Extend SDD/schema/model/seed/detail page for role/mission/clues/risks/preparation.
5. Redesign homepage/Explore around fantasy discovery; defer or unblock AI pet modal.
6. Decide whether to keep vanilla frontend or explicitly switch to React.
7. Implement admin/favorites only if they remain in submission scope.
8. Add k6 and Go pressure tests after correctness tests pass.
9. Re-run CodeRabbit after there is a real reviewable diff or a PR branch.

---

## 11. Submission Readiness Checklist

| Item | Current Status |
|---|---|
| Go tests | Pass |
| Go vet | Pass |
| Playwright E2E | Fails: 15/29 passing |
| Coverage claims | Not aligned with current output |
| SQLite used | Yes |
| At least 5 entries | Yes, 12 entries |
| Story-driven product model | Partial |
| Mission/role/clues detail model | Missing |
| Search/filter correctness | Broken/incomplete |
| Admin | Placeholder |
| Favorites | Not implemented end-to-end |
| Prompt log | Incomplete, needs transparent reconstruction |
| Deployment readiness | Not full-stack ready |
| app.xlsx | Missing |
| CodeRabbit review | Attempted, blocked by service/diff errors |

Final judgment: **Not ready for submission**. The project is a strong generated baseline, but it needs one focused repair pass for truthfulness, E2E correctness, product-model completion, and deployment documentation before it can be submitted safely.
