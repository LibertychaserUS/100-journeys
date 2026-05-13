# Multi-Agent Workflow — 100 Journeys

---

## Agent Roles

### Main Agent
- Holds full project context across all phases
- Reads CURRENT_STATE.md at the start of every session
- Breaks work into discrete sub-tasks with clear I/O contracts
- Reviews all sub-agent output before accepting
- Writes checkpoint + updates DEVELOPMENT_LOG.md after each phase gate
- Enforces IEEE standard compliance

### Sub-Agent (Execution)
- Receives a bounded task: one module, one file set, one phase slice
- Works within the scope of the API contract / test plan / design spec
- Returns output for Main agent review
- Does NOT modify trace/, docs/workflow/, or make git tags

---

## Phase Flow

```
Phase 0: Skeleton (done)
    ↓
Phase 1: SDD — Schema & API Contract
    Main: finalize API contract + schema
    Sub:  implement SQLite repository + Gin handlers
    Main: review, integration test, gate check
    ↓  [CP-SDD-001 + v0.1.0-sdd tag]
Phase 2: DDD — Design & UI Components
    Main: UIUXProMax design brief
    Sub:  implement CSS components + page layouts
    Main: visual review, DDD gate check
    ↓  [CP-DDD-001 + v0.2.0-ddd tag]
Phase 3: TDD — Test-Driven Core Logic
    Main: write test specs first (IEEE 29119)
    Sub:  implement to make tests pass
    Main: coverage review, TDD gate check
    ↓  [CP-TDD-001 + v0.3.0-tdd tag]
Phase 4: E2E — End-to-End Validation
    Sub:  Playwright E2E tests for 3 core flows
    Main: E2E gate check, final audit
    ↓  [CP-E2E-001 + v1.0.0 tag]
```

---

## Phase Gate Criteria Template

Each phase must satisfy its gate before proceeding:

| Gate Item | SDD | DDD | TDD | E2E |
|---|---|---|---|---|
| Docs updated | ✓ | ✓ | ✓ | ✓ |
| Code reviewed by Main | ✓ | ✓ | ✓ | ✓ |
| Tests pass | — | — | ✓ | ✓ |
| Checkpoint file written | ✓ | ✓ | ✓ | ✓ |
| DEVELOPMENT_LOG updated | ✓ | ✓ | ✓ | ✓ |
| Git tag created | ✓ | ✓ | ✓ | ✓ |
| Prompt log entry added | ✓ | ✓ | ✓ | ✓ |

---

## Audit Trail Structure

```
docs/
├── schema/          ← SDD artifacts
├── ui-components/   ← DDD artifacts
├── testing/         ← TDD/E2E artifacts
├── prompts/         ← AI prompt log (5 phases)
├── workflow/        ← this file
└── trace/
    ├── DEVELOPMENT_LOG.md    ← append-only main log
    ├── CURRENT_STATE.md      ← overwrite per checkpoint
    └── checkpoints/
        ├── CP-000-skeleton.md
        ├── CP-SDD-001.md
        ├── CP-DDD-001.md
        ├── CP-TDD-001.md
        └── CP-E2E-001.md
```

Any commit can be replayed via `git checkout <tag>`.
All decisions traceable via DEVELOPMENT_LOG + checkpoint files.
