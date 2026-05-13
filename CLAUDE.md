# CLAUDE.md — 100 Journeys Project Constraints

> This file governs ALL development activity in this project.
> Main agent reads this at the start of every session.
> Sub-agents receive the relevant sections as task context.

---

## 1. Project Identity

**Name**: 100种不可思议的旅行 · Lightweight Content MVP
**Repo**: 100-journeys
**Path**: /Users/nihao/Documents/100-journeys/
**Assignment**: AI开发实习生远程作业 — 72h deadline, submit to xulei@bizguest.com

---

## 2. Tech Stack (LOCKED)

| Layer | Choice | Constraint |
|---|---|---|
| Backend | Go + Gin | Pure Go only, no CGO |
| Database | SQLite via `modernc.org/sqlite` | No CGO, no external DB server |
| Frontend | Vanilla HTML / CSS / JS | No framework (React/Vue/etc.) |
| Routing | Hash-based SPA (`#/`) | No server-side route fallback needed |
| Images | Local static, CDN-ready | Switch via env var, zero frontend change |

---

## 3. Development Methodology (STRICT — IEEE Standards)

### 3.1 SDD — Spec/Schema-Driven Development
**Standard**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering)
**Rule**: Schema and API contract MUST be finalized and signed-off BEFORE any implementation code is written.
**Artifacts required**:
- `docs/schema/SDD-spec.md` — functional/non-functional requirements, ER diagram, API envelope
- `docs/schema/api-contract.md` — full endpoint specification with types
- `db/schema.sql` — authoritative DDL

**ISO/IEC/IEEE 29148:2018 compliance**:
- §6.2: Purpose and scope documented
- §6.3: Stakeholder needs identified
- §6.4: System requirements (FR + NFR) with unique IDs
- §6.5: Data schemas (ER diagram in mermaid)
- §6.6: Interface specifications (API contract)

### 3.2 DDD — Design-Driven Development
**Standard**: IEEE 1016-2009 (Software Design Descriptions)
**Rule**: UI/UX design MUST be produced via UIUXProMax BEFORE any CSS/HTML component is implemented. CSS tokens MUST be updated from design output.
**Artifacts required**:
- `docs/ui-components/DDD-spec.md` — viewpoints, component tree, props contracts
- Updated `web/css/tokens.css` from design
- Component wireframes/mockups

**IEEE 1016-2009 compliance (viewpoints)**:
- Context viewpoint: user flow between routes
- Composition viewpoint: component tree
- Interface viewpoint: component props and states
- Structure viewpoint: CSS layer architecture (tokens→global→layout→components→pages)

### 3.3 TDD — Test-Driven Development
**Standard**: ISO/IEC/IEEE 29119-3 (Test Documentation)
**Rule**: Test cases MUST be written BEFORE the code they test (Red → Green → Refactor). No exceptions.
**Artifacts required**:
- `docs/testing/TDD-spec.md` — all test cases specified in advance
- `tests/unit/` — Go unit tests (repository + service)
- `tests/integration/` — Go httptest integration tests
- `e2e/` — Playwright E2E tests

**ISO/IEC/IEEE 29119-3 compliance**:
- Test plan with scope, approach, environment
- Test cases with unique IDs (UT-REPO-*, UT-SVC-*, IT-API-*, E2E-*)
- Coverage targets documented and met
- Test results recorded

---

## 4. Multi-Agent Workflow Rules

### Main Agent Responsibilities
- Read `docs/trace/CURRENT_STATE.md` at the start of EVERY session
- Understand full project context before delegating
- Break work into bounded sub-tasks with explicit I/O contracts
- Review ALL sub-agent output before accepting
- Write checkpoint + update log after each phase gate
- Enforce IEEE compliance on all documents

### Sub-Agent Rules
- Work only within assigned scope (one module / one file set)
- Never modify: `docs/trace/`, `docs/workflow/`, `CLAUDE.md`, git tags
- Return output for Main agent review
- Flag blockers immediately, do not work around them silently

### Delegation Format
When Main delegates to Sub, provide:
1. Phase context (which phase, what stage)
2. Input: what exists (files, interfaces, specs)
3. Output: exactly what to produce
4. Constraints: which rules apply
5. Gate: how output will be reviewed

---

## 5. Trace & Checkpoint System (MANDATORY)

Every phase gate requires ALL THREE:

### A. Checkpoint File
Location: `docs/trace/checkpoints/CP-[ID]-[phase].md`
Contents: snapshot of files, decisions, phase gate checklist, replay instructions

### B. DEVELOPMENT_LOG Entry
Location: `docs/trace/DEVELOPMENT_LOG.md`
Format: append-only, one entry per phase, includes Done / Decisions / Next

### C. Git Tag
Format: `v[major].[minor].[patch]-[phase]`
- `v0.0.0-skeleton` — Phase 0 (current)
- `v0.1.0-sdd` — Phase 1: SDD complete
- `v0.2.0-ddd` — Phase 2: DDD complete
- `v0.3.0-tdd` — Phase 3: TDD complete
- `v1.0.0` — Phase 4: E2E complete, production-ready

**CURRENT_STATE.md** is overwritten at each checkpoint to always reflect latest state.

---

## 6. Prompt Log Requirements

Location: `docs/prompts/prompt-log.md`
Required: 5 phase entries minimum, each recording the key prompts used.

| Phase | Label |
|---|---|
| 1 | SDD: Data modeling & API contract |
| 2 | DDD: UI component generation |
| 3 | TDD: Unit & integration tests |
| 4 | E2E: End-to-end tests |
| 5 | Feature: Core logic implementation |

---

## 7. Code Quality Rules

- All DB queries: parameterized (NO string interpolation → SQL injection prevention)
- Repository layer: MUST implement `JourneyRepository` interface
- Service layer: MUST use `MediaProvider` interface (never hardcode paths)
- API responses: MUST use standard envelope `{ data, error, total?, page?, limit? }`
- CSS: MUST follow layer order (tokens → global → layout → components → pages)
- JS: MUST read all config from `window.APP_CONFIG`

---

## 8. Deliverables Checklist

- [ ] GitHub/Gitee repo with full commit history
- [ ] `db/schema.sql` + `db/seed.sql` (5 sample journeys)
- [ ] `README.md` with run instructions, tech stack, mermaid ER
- [ ] `docs/prompts/prompt-log.md` (5 phases)
- [ ] `docs/schema/` SDD artifacts
- [ ] `docs/ui-components/` DDD artifacts
- [ ] `docs/testing/` TDD + E2E artifacts
- [ ] `docs/trace/` full audit trail
- [ ] `app.xlsx` test case spreadsheet
- [ ] All tests passing: `go test ./...`
- [ ] Git tags: v0.0.0-skeleton → v1.0.0

---

## 9. Phase Status

| Phase | Status | Git Tag |
|---|---|---|
| 0: Skeleton | ✅ Complete | `v0.0.0-skeleton` |
| 1: SDD | ⏳ Next | `v0.1.0-sdd` |
| 2: DDD | ⏳ Pending | `v0.2.0-ddd` |
| 3: TDD | ⏳ Pending | `v0.3.0-tdd` |
| 4: E2E | ⏳ Pending | `v1.0.0` |

---

## 10. Blocker: Go Not Installed

Run before Phase 1 can begin:
```bash
brew install go
cd /Users/nihao/Documents/100-journeys
go mod init github.com/100-journeys/app
go get github.com/gin-gonic/gin
go get modernc.org/sqlite
```
