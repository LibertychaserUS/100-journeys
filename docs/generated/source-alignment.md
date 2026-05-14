# 生成文档来源对齐 / Generated Artifact Source Alignment

本文记录每个生成文档产物来自哪些代码输入，避免图表和实际功能脱节。

| 产物 Artifact | 代码/程序来源 Source | 对齐规则 Alignment rule |
|---|---|---|
| `database-er.mmd` | `db/schema.sql` | Tables and columns are parsed from `CREATE TABLE IF NOT EXISTS` blocks. Relationships are limited to schema-level FK tables and known join/ledger tables. |
| `api-routes.md` | `cmd/server/main.go`, `internal/handler/*_handler.go` | Routes are parsed from Gin registration plus route helper registrations. |
| `frontend-routes.md` | `web/js/router.js` | Routes are parsed from `Router.define(...)`. |
| `test-evidence.md` | `internal/**/*_test.go`, `e2e/tests/*.js`, `tests/stress/*.go`, `tests/load/*.js` | Test counts are file-system derived. |
| `sample-journeys.csv` | `db/schema.sql`, `db/seed.sql` | A temporary SQLite database loads the authoritative schema and seed, then exports every seeded journey row. |
| `sample-journeys.md` | `db/schema.sql`, `db/seed.sql` | Same generated seed data as CSV, formatted as a reviewer-readable table. |
| `user-cases.mmd` | `web/js/router.js`, auth/admin/order/payment handlers | Actors only cover implemented routes and role gates. |
| `system-dag.mmd` | `cmd/server/main.go`, repository/service/handler wiring | Nodes reflect instantiated runtime dependencies. |
| `delivery-gantt.mmd` | `git log`, maintained trace docs | Timeline reflects committed phase progression. |

## 当前计数 / Current Counts

- 解析 schema 表数量 / Schema tables parsed: 14
- 生成 API 路由数量 / API routes generated: 23
- 生成前端路由数量 / Frontend routes generated: 10
- 测试证据文件数 / Test files in evidence matrix: 27
