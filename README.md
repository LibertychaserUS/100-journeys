# 100 Journeys | 100种不可思议的旅行

[![CI/CD](https://github.com/LibertychaserUS/100-journeys/actions/workflows/ci.yml/badge.svg)](https://github.com/LibertychaserUS/100-journeys/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Tencent%20Cloud-live%20demo-blue)](http://49.232.207.220/)
[![CodeRabbit](https://img.shields.io/badge/CodeRabbit-review%20actioned-orange)](https://github.com/LibertychaserUS/100-journeys/pull/1)
[![Stress](https://img.shields.io/badge/stress-target%20profile%20passing-green)](docs/ops/LOAD_TEST_RESULTS.md)
[![k6](https://img.shields.io/badge/k6-baseline%20recorded-blue)](docs/ops/LOAD_TEST_RESULTS.md)
[![E2E Tests](https://img.shields.io/badge/E2E%20tests-Playwright%2029%2F29%20passing-green)](docs/QUALITY_REVIEW_REPORT.md)

中文：**100种不可思议的旅行** 是一个轻量级全栈 Web App MVP，以“情绪 / MBTI / 隐藏身份 / 奇幻旅程”为入口，把旅行内容做成故事卡片、AI 宠物陪伴、WonderCoin 模拟下单和后台统计证据闭环。

English: **100 Journeys** is a lightweight full-stack Web App MVP for story-driven fantasy travel discovery. Users choose a mood, persona, or hidden world instead of browsing a conventional destination list.

Current stable branch: `main`

---

## Development Context | 开发语境

中文：本项目交付开发统一记录为 **使用已接入 Kimi API 的 Claude Code 完成**。Kimi API 通过本地 Claude Code launcher 接入后，Claude Code 负责需求拆解、SDD/DDD/TDD/E2E、全栈实现、测试验证和文档整理。

English: This delivery records the implementation context as **completed with Claude Code connected to the Kimi API**. Claude Code, backed by the Kimi API integration, was used for requirements breakdown, SDD/DDD/TDD/E2E, full-stack implementation, verification, and documentation.

---

## Live Demo | 在线演示

中文：当前域名备案尚未完成，因此公网演示使用腾讯云 CVM 的临时 IP 地址。备案通过后可将域名解析到 Nginx，并补充 HTTPS 证书。

English: The domain filing is not complete yet, so the public demo uses the Tencent Cloud CVM IP address. After filing, the domain can point to Nginx with HTTPS enabled.

| Item | URL / Account |
|---|---|
| Public demo | <http://49.232.207.220/> |
| User login | <http://49.232.207.220/#/login> |
| User account | `[DEMO_USER]` / `[DEMO_USER_PASSWORD]` |
| Hidden admin login | <http://49.232.207.220/#/admin-login> |
| Admin account | `[DEMO_ADMIN]` / `[DEMO_ADMIN_PASSWORD]` |

中文：建议使用夜间模式查看，整体视觉观感最佳。

English: Dark mode is recommended for the best visual experience.

中文：公网演示账号属于临时演示凭据，演示结束后可轮换或关闭。真实环境不得在 README、Git history 或公开文档中保存明文密码；管理员账号应通过服务器侧 `cmd/admin-user` CLI 创建/提升，本地演示账号由 `scripts/deploy/local-one-click.sh` 在终端输出。本地 demo 数据库可删除 `data/*.db*` 后重新运行 `scripts/deploy/local-one-click.sh` 重置；公网 demo 凭据由服务器环境变量和 `scripts/deploy/init-demo-data.sh` 控制，不与生产凭据共用。

English: Public demo accounts are temporary demo credentials and can be rotated or disabled after use. Plaintext production credentials must never be stored in README, Git history, or public docs; admin users are created/promoted through the server-side `cmd/admin-user` CLI, while local demo accounts are printed by `scripts/deploy/local-one-click.sh`. To reset local demo data, remove `data/*.db*` and rerun `scripts/deploy/local-one-click.sh`; public demo credentials are controlled by server environment variables and `scripts/deploy/init-demo-data.sh`, separate from production credentials.

```mermaid
flowchart LR
    browser["外部浏览器"] --> cvm["Tencent Cloud CVM<br/>49.232.207.220:80"]
    cvm --> nginx["Nginx reverse proxy"]
    nginx --> spa["Hash SPA"]
    nginx --> api["Go API<br/>127.0.0.1:8080"]
    api --> sqlite[("SQLite<br/>/var/lib/100-journeys/app.db")]
```

---

## Product Position | 产品定位

中文：本项目不是传统旅行列表站，而是“桃源百旅”方向的内容型 MVP，围绕以下已实现能力构建。

English: The app is not a generic travel listing site. It is a compact content MVP built around:

- **情绪 / MBTI / 人设探索 | Mood / MBTI / persona discovery**: 搜索、情绪 chips、MBTI、幻想标签进入旅程。
- **故事卡片浏览 | Story-card browsing**: 图片卡片进入角色、任务、线索、风险和准备建议。
- **AI 宠物旅伴 | AI travel companion**: 像素宠物提供 MBTI 问答和推荐引导。
- **模拟交易 | Simulated commerce**: 注册、充值 WonderCoin、创建订单、钱包支付、交易流水。
- **后台证据闭环 | Admin evidence loop**: 管理员查看真实统计、点击、购买、性别/MBTI、审计日志，并导出 CSV/JSON。

---

## Tech Stack | 技术栈

| Layer | Technology | Constraint |
|---|---|---|
| Backend | Go + Gin | Pure Go, no CGO |
| Database | SQLite via `modernc.org/sqlite` | WAL mode, single-writer boundary, busy retry |
| Frontend | Vanilla HTML / CSS / JS | Hash SPA, no React/Vue |
| Auth | JWT + bcrypt + math captcha | Public registration cannot create admin |
| Analytics | Buffered P2 event queue | Drops are allowed only for non-critical analytics |
| Audit | Persistent `audit_logs` | API errors, panic, and frontend errors |
| Static media | Local-first JPG/SVG assets, CDN-ready fallback | Nginx/CDN recommended; `CDN_BASE_URL` is fallback for missing local media |
| Tests | Go tests, Go stress, k6, Playwright | k6/Nginx baseline verified; visual browser audit captured; Playwright 29/29 passing |
| CI/CD | GitHub Actions | Full-stack smoke added; remote run pending after push |
| Image assets | image2 + local JPG/SVG assets | image2 was used as an image generation/material tool; it is not the core code-development tool |

---

## Database Access | 数据库访问

中文：项目没有使用 GORM。数据库层采用 Go 标准 `database/sql`、`modernc.org/sqlite` 和 repository/service 分层。这样做的原因是本项目强调 SQLite、schema/API 契约、测试证据和可审计 SQL；手写参数化 SQL 更容易直接证明 `db/schema.sql`、API 行为和测试结果一致。

English: The project does not use GORM. It uses Go `database/sql`, `modernc.org/sqlite`, and repository/service layers so the SQLite schema, API contract, SQL statements, and tests remain directly auditable.

- 注册写入：`AuthHandler.Register` 校验验证码、用户名、密码和邮箱唯一性，然后 bcrypt 生成 `password_hash`，最后由 `UserRepository.Create` 用参数化 SQL 写入 `users`。
- P0/P1 写入：用户、订单、钱包支付、交易流水使用同步 SQL 和事务，不进入 analytics buffer。
- SQLite 并发：`repository.NewDB` 开启 WAL、foreign keys、busy timeout，并将连接限制为单连接；`retryBusy` 对 SQLite busy/lock 做短重试。
- P2 buffer：`analytics.Buffer` 只处理点击、搜索、筛选、宠物回复等非关键事件，默认容量 `32768`，批量写入 `analytics_events`；满了只丢 P2，不影响注册、下单或支付。

---

## System DAG | 系统设计 DAG

```mermaid
flowchart LR
    user["Guest / User / Admin"] --> nginx["Nginx or CDN static edge"]
    nginx --> spa["Hash SPA: HTML / CSS / JS"]
    nginx --> api["Go Gin API"]
    spa --> api
    api --> mw["Middleware: CORS / RequestID / JWT / Audit"]
    mw --> handlers["Handlers"]
    handlers --> services["Services: Journey / AI / Media"]
    handlers --> repos["Repositories"]
    services --> repos
    repos --> sqlite[("SQLite WAL")]
    handlers --> buffer["Analytics Buffer P2"]
    buffer --> sqlite
    mw --> audit["P1 SQL audit: audit_logs"]
    audit --> sqlite
    handlers --> eventbus["In-process Event Bus"]
    eventbus --> logs["Process/reverse-proxy runtime logs"]
    admin["Server-side admin CLI"] --> sqlite
    backup["backup-sqlite.sh"] --> sqlite
```

中文：`audit_logs` 是 SQLite 中的审计表，只保存 API 请求证据、API 错误、panic 和前端 client error。高频原始运行日志，例如 Go stdout/stderr、本地一键启动的 `tmp/local-one-click/server.log`、Nginx access/error log、systemd/journal，保留为文件或进程日志，避免把 SQLite 变成通用日志仓库。

English: `audit_logs` is the SQLite audit table for API request evidence, API errors, panics, and frontend client errors. High-volume raw runtime logs, such as Go stdout/stderr, local one-click `tmp/local-one-click/server.log`, Nginx access/error logs, and systemd/journal output, remain file/process logs so SQLite is not turned into a general log sink.

---

## User Cases | 用户用例

```mermaid
flowchart LR
    guest["Guest"] --> browse["Browse home"]
    guest --> explore["Search and filter journeys"]
    guest --> detail["Read journey detail"]
    guest --> register["Register with captcha"]
    guest --> login["Login"]

    register --> authed["Authenticated registered user"]
    login --> authed
    cookie["Remembered token auto login"] --> authed

    authed --> explore
    authed --> logout["Logout"]
    authed --> user["Registered user capabilities"]
    user --> pet["AI pet chat and MBTI quiz"]
    user --> recharge["Recharge WonderCoin"]
    user --> order["Create order"]
    user --> pay["Pay order"]
    user --> profile["View profile, orders, ledger"]

    admin["Admin"] --> adminLogin["Hidden admin login"]
    admin --> dashboard["Real dashboard metrics"]
    admin --> export["Export CSV / JSON"]
    admin --> audit["Review audit and analytics"]
```

---

## Database ER Diagram | 数据库 ER 图

```mermaid
erDiagram
    JOURNEYS ||--o{ JOURNEY_TAGS : has
    TAGS ||--o{ JOURNEY_TAGS : categorizes
    JOURNEYS ||--o{ JOURNEY_MBTI : matches
    MBTI_TYPES ||--o{ JOURNEY_MBTI : assigned
    USERS ||--o{ USER_POINTS_HISTORY : earns
    USERS ||--o{ USER_SAVED_JOURNEYS : saves
    JOURNEYS ||--o{ USER_SAVED_JOURNEYS : saved_as
    USERS ||--o{ ORDERS : places
    ORDERS ||--o{ ORDER_ITEMS : contains
    JOURNEYS ||--o{ ORDER_ITEMS : snapshots
    USERS ||--o{ TRANSACTIONS : has
    ORDERS ||--o{ TRANSACTIONS : generates
    USERS ||--o{ ANALYTICS_EVENTS : may_emit

    JOURNEYS {
        int id PK
        string title
        string slug UK
        string fantasy_type
        string visual_style
        int adventure_index
        int risk_level
        int price
    }

    USERS {
        int id PK
        string username
        string email UK
        string password_hash
        string role
        int points
        int balance
        string gender
    }

    ORDERS {
        int id PK
        string order_no UK
        int user_id FK
        string status
        int total_amount
        datetime paid_at
    }

    ORDER_ITEMS {
        int id PK
        int order_id FK
        int journey_id FK
        string journey_title
        int unit_price
        int quantity
    }

    TRANSACTIONS {
        int id PK
        int user_id FK
        int order_id FK
        string txn_type
        int amount
        int balance_after
    }

    ANALYTICS_EVENTS {
        int id PK
        string event_type
        string journey_slug
        int user_id FK
        string mbti_type
        string gender
    }

    AUDIT_LOGS {
        int id PK
        string request_id
        string level
        string source
        string path
        int status_code
    }
```

Full generated ER source: [`docs/generated/database-er.mmd`](docs/generated/database-er.mmd)

---

## Delivery Gantt | 交付时间线

```mermaid
gantt
    title 100 Journeys Delivery Timeline
    dateFormat  YYYY-MM-DD
    axisFormat  %m-%d
    section Foundation
    Skeleton and governance        :done, p0, 2026-05-13, 1d
    SDD schema and API contract    :done, p1, 2026-05-13, 1d
    DDD vanilla SPA implementation :done, p2, 2026-05-13, 1d
    TDD and E2E baseline           :done, p3, 2026-05-13, 1d
    section Feature Expansion
    Auth, profile, order, payment  :done, p4, 2026-05-13, 1d
    v1.2 UX and operations pass    :done, p5, 2026-05-13, 1d
    section Production Readiness
    Taoyuan frontend redesign      :done, p6, 2026-05-14, 1d
    Admin analytics and audit      :done, p7, 2026-05-14, 1d
    Stress matrix and runbooks     :done, p8, 2026-05-14, 1d
    k6 and Nginx verification      :done, p9, 2026-05-14, 1d
```

---

## API Surface | API 概览

中文：JSON API 使用统一响应信封 `{ data, error, total?, page?, limit? }`；`/api/admin/export?format=csv` 是 CSV 明确例外。

English: JSON API responses use the standard envelope `{ data, error, total?, page?, limit? }`; `/api/admin/export?format=csv` is the explicit CSV exception.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/journeys` | Public | List journeys with search/filter/pagination |
| `GET` | `/api/journeys/:slug` | Public | Journey detail |
| `GET` | `/api/tags`, `/api/mbti` | Public | Filter taxonomies |
| `POST` | `/api/auth/register`, `/api/auth/login` | Public | Captcha-aware auth |
| `GET` | `/api/auth/me` | JWT | Current profile |
| `POST` | `/api/auth/avatar` | JWT | Avatar upload |
| `POST` | `/api/orders` | JWT | Create multi-item order |
| `POST` | `/api/orders/:id/pay` | JWT | Atomic wallet payment |
| `POST` | `/api/payments/recharge` | JWT | Simulated WonderCoin recharge |
| `GET` | `/api/admin/stats` | Admin | Real dashboard stats |
| `GET` | `/api/admin/export` | Admin | CSV/JSON export |
| `POST` | `/api/analytics/events` | Public/JWT | Buffered P2 analytics |
| `POST` | `/api/audit/client-error` | Public/JWT | Frontend error audit |

Full generated route matrix: [`docs/generated/api-routes.md`](docs/generated/api-routes.md)

---

## Quick Start | 快速启动

```bash
git clone https://github.com/LibertychaserUS/100-journeys.git
cd 100-journeys
git switch main

go mod tidy
scripts/deploy/local-one-click.sh
```

Then open:

```text
The URL printed by the script, for example http://127.0.0.1:18080/
```

Create or promote an admin account server-side:

```bash
ADMIN_PASSWORD='<set-via-env-or-secret-manager>' \
go run ./cmd/admin-user \
  -db ./data/app.db \
  -email '<admin-email>' \
  -username '<admin-username>'
```

Generate deterministic demo data for dashboard review:

```bash
scripts/deploy/init-demo-data.sh ./data/demo.db
```

The demo generator creates 50 ordinary users and 3 admin users with bcrypt password hashes, local GitHub-style default avatars, complete required profile fields, paid orders, wallet transactions, saved journeys, analytics events, and audit evidence. Usernames may repeat in product terms; ownership is bound to the server-side account identity, not displayed as an internal database ID.

Demo accounts after initialization are printed by `scripts/deploy/init-demo-data.sh` and `scripts/deploy/local-one-click.sh`. Public demo credentials should be rotated or disabled after use.

## One-Click Local Deploy | 本地一键部署

中文：本地验收推荐直接使用一键脚本。脚本会初始化 SQLite、演示用户、管理员、订单、流水和后台统计数据，并自动选择空闲端口。如果默认 `18080/18081` 被占用，会自动顺延到下一个可用端口；连续递增 5 次仍不可用时，会说明现实原因并退出。

English: For local review, use the one-click script. It initializes SQLite, demo users, admins, orders, transactions, and dashboard evidence, then auto-selects free ports when the defaults are occupied.

```bash
scripts/deploy/local-one-click.sh
```

Stop it:

```bash
scripts/deploy/local-one-click.sh --stop
```

Full local guide: [`docs/ops/LOCAL_ONE_CLICK_GUIDE.md`](docs/ops/LOCAL_ONE_CLICK_GUIDE.md)

---

## Verification | 验证方式

核心检查 | Core checks:

```bash
GOCACHE="$PWD/.cache/go-build" go test ./...
GOCACHE="$PWD/.cache/go-build" go vet ./...
find web/js -name '*.js' -exec node --check {} \;
```

Medium-site Go stress profile:

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
GOCACHE="$PWD/.cache/go-build" \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

Nginx + k6 本地验证 | Local Nginx + k6:

```bash
scripts/nginx/render-local-config.sh 18080 18081
nginx -t -c "$PWD/deploy/nginx.local.conf" -p "$PWD/.nginx"

BASE_URL=http://127.0.0.1:18080 VUS=200 DURATION=30s k6 run tests/load/public-content-flow.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=80 DURATION=30s k6 run tests/load/order-payment-audit.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=300 DURATION=30s k6 run tests/load/image-static-cache.k6.js
```

Playwright E2E:

```bash
cd e2e
npx playwright test
```

Current evidence status | 当前证据状态:

| Area | Status |
|---|---|
| Go unit/integration | Passing: `go test ./...` |
| Go vet | Passing: `go vet ./...` |
| JS syntax | Passing: `node --check` over `web/js`, `e2e/tests`, and `tests/load` |
| Go stress target profile | Passing: `ok .../tests/stress 1.660s` |
| k6 | Local Nginx baseline recorded; post-fix smoke passed through one-click Nginx URL with trailing slash; Tencent Cloud public-IP smoke passed within Nginx rate limit |
| Browser visual audit | Captured real desktop/mobile pages, profile, recharge, and admin dashboard screenshots from local Nginx |
| Playwright | Passing: `29 passed` on 2026-05-14 |
| Nginx/CDN | Local Nginx verified; Tencent Cloud Nginx reverse proxy deployed at `http://49.232.207.220/`; public API is rate-limited; HTTPS waits for filed domain |
| CI/CD | `.github/workflows/ci.yml` added; remote GitHub Actions result pending after push |

---

## Deployment Position | 部署口径

中文：GitHub Pages 实际不可作为本项目可用演示入口。当前 Pages URL 只能返回静态 HTML，但项目页位于 `/100-journeys/` 子路径下，页面中的 `/static/...` 资源请求会落到站点根路径而返回 404；同时 GitHub Pages 不能运行 Go API，也不能持久化 SQLite。因此完整可用演示以腾讯云公网地址为准。

English: GitHub Pages is not a usable demo entry for this project. The current Pages URL can return static HTML, but the project is served under `/100-journeys/` while the SPA requests `/static/...` assets from the site root, which returns 404. GitHub Pages also cannot run the Go API or persist SQLite. The working full-stack demo is the Tencent Cloud public IP.

Deployment paths:

| Path | Fit | Notes |
|---|---|---|
| Tencent Cloud CVM public IP | Current external demo | Go + SQLite + Nginx on `http://49.232.207.220/`; no domain filing required for IP demo |
| Tencent Cloud filed domain | Formal China mainland domain path | Requires ICP filing before domain points to mainland CVM |
| Local/demo | Development proof | `go run`, SQLite file, local generated images |
| Alibaba Cloud mainland ECS | Alternative China-access candidate after ICP | Requires ICP filing for formal mainland-domain service |
| Alibaba Cloud HK/Singapore | Possible no-mainland-ICP host | Full-stack deployable, mainland access still best-effort |
| Railway/Fly/Render paid small instance | Low-ops full-stack option | Needs paid persistent storage for reliable SQLite |
| GitHub Pages | Not usable as demo | Static HTML may load, but root `/static/...` assets and `/api/...` calls return 404; no Go API or SQLite runtime |
| Vercel static asset preview | Possible for the dynamic Hash SPA shell only | Current Go + SQLite full stack is not Vercel-native without external API/storage redesign |
| CDN/R2/OSS for images | Future media layer | Mirror public assets and use `CDN_BASE_URL` as a missing-local fallback or edge cache source |

Current demo URL: <http://49.232.207.220/>

Hidden admin route: <http://49.232.207.220/#/admin-login>

Current choice: Tencent Cloud CVM public IP demo. Formal domain deployment waits for ICP filing and HTTPS certificate setup.

当前选择：腾讯云 CVM 公网 IP 演示。正式域名部署等待备案和 HTTPS 证书配置。

Operational docs:

- [`docs/ops/PRODUCTION_READINESS.md`](docs/ops/PRODUCTION_READINESS.md)
- [`docs/ops/DISASTER_RECOVERY.md`](docs/ops/DISASTER_RECOVERY.md)
- [`docs/ops/LOAD_TEST_RESULTS.md`](docs/ops/LOAD_TEST_RESULTS.md)
- [`docs/ops/LOCAL_ONE_CLICK_GUIDE.md`](docs/ops/LOCAL_ONE_CLICK_GUIDE.md)
- [`deploy/nginx.conf`](deploy/nginx.conf)

---

## Documentation Evidence | 文档证据

| Artifact | Purpose |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Current product requirements derived from implemented behavior |
| [`docs/INITIAL_PRD.md`](docs/INITIAL_PRD.md) | Initial product requirement baseline |
| [`docs/BDD-spec.md`](docs/BDD-spec.md) | Given/When/Then business behavior scenarios |
| [`docs/schema/SDD-spec.md`](docs/schema/SDD-spec.md) | Schema/API-driven requirements baseline |
| [`docs/ui-components/DDD-spec.md`](docs/ui-components/DDD-spec.md) | UI component/design description baseline |
| [`docs/testing/TDD-spec.md`](docs/testing/TDD-spec.md) | Test plan and RED/GREEN evidence |
| [`docs/SAMPLE_DATA.md`](docs/SAMPLE_DATA.md) | Seed data quality explanation and generated sample CSV pointers |
| [`docs/ops/LOAD_TEST_RESULTS.md`](docs/ops/LOAD_TEST_RESULTS.md) | Nginx and k6 execution evidence |
| [`docs/workflow/AI_DEVELOPMENT_WORKFLOW.md`](docs/workflow/AI_DEVELOPMENT_WORKFLOW.md) | Claude Code + Kimi API workflow explanation |
| [`docs/workflow/DOCUMENTATION_EVOLUTION.md`](docs/workflow/DOCUMENTATION_EVOLUTION.md) | Documentation history and Git-stage evolution |
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | Delivery checklist and archive list |
| [`docs/generated/`](docs/generated/) | Code-derived diagrams and route/test matrices |
| [`docs/prompts/prompt-log.md`](docs/prompts/prompt-log.md) | Prompt trace |
| [`app.xlsx`](app.xlsx) | Test-case spreadsheet |

Regenerate code-derived docs:

```bash
python3 scripts/docs/generate_project_artifacts.py
```

---

## Known Boundaries | 已知边界

- `user_saved_journeys` exists, but full favorite API UX still needs final completion or explicit local-only scope.
- SQLite is acceptable for this MVP and medium single-node demo, not for unlimited high-concurrency production.
- Analytics events are P2 and may degrade under extreme pressure; P0 orders/payments do not use the lossy buffer.
- Local Go static image serving is not the production plan; use Nginx/CDN/R2 for image traffic. The current service resolves local assets first and falls back to `CDN_BASE_URL` only when a local file is missing.
- Production must use HTTPS; local HTTP is only a Nginx/k6 test fixture.
- k6 baseline, visual browser audit, and full scripted Playwright E2E have been refreshed locally; Tencent Cloud HTTP demo has been smoke-tested, while HTTPS waits for filed domain setup.
- Without ICP filing, do not claim formal mainland China deployment on Alibaba Cloud mainland resources.

---

## Package | 打包材料

中文：完整交付材料包含源码压缩包、Markdown 文档、Prompt 记录、工作流说明、GitHub 仓库链接和公网演示地址。

English: The complete package includes the source archive, Markdown documentation, prompt records, workflow explanation, GitHub repository link, and public demo URL.
