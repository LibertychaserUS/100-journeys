# SDD 规格说明 - Schema/API Driven Development

**标准对齐**: ISO/IEC/IEEE 29148:2018 Requirements Engineering
**项目**: 100种不可思议的旅行 Web App MVP
**分支**: `feature/taoyuan-production-readiness`
**状态**: 当前实现基线
**权威 DDL**: `db/schema.sql`
**生成证据**: `docs/generated/database-er.mmd`、`docs/generated/api-routes.md`

---

## 1. 目的与范围

本文档定义当前全栈 MVP 的系统需求、数据模型、接口边界和可验证约束。项目采用 SDD：schema/API 契约是后端实现、前端调用、测试、文档和图表的共同基线。

### 1.1 范围内

- 旅程浏览、搜索、筛选、详情、标签、MBTI 匹配。
- 用户注册/登录、验证码、JWT、bcrypt、个人资料、头像、积分、钱包。
- WonderCoin 模拟充值、订单创建、事务支付、交易流水。
- 管理员隐藏登录、用户列表、真实聚合统计、CSV/JSON 导出。
- P2 analytics buffer 与 P1 audit logs。
- 本地/Nginx/CDN 可切换的媒体路径。
- 腾讯云 CVM + Nginx + SQLite WAL 公网 IP 演示部署、备份和负载证据。

### 1.2 范围外

- 真实货币支付网关。
- 真实旅游供应商预订。
- 真实 LLM 供应商接入。
- 无备案条件下的中国大陆正式公网部署承诺。
- 超出单机 SQLite 边界的无限生产级扩展。

## 2. 干系人需求

| 干系人 | 需求 | 追踪依据 |
|---|---|---|
| 游客 | 快速理解产品并浏览幻想旅程 | `journeys`、`GET /api/journeys`、`#/`、`#/explore` |
| 注册用户 | 保存身份、钱包、积分、订单和流水 | `users`、`orders`、`transactions`、JWT 路由 |
| 管理员 | 查看真实指标并导出证据 | `admin_repo.go`、`analytics_events`、`audit_logs` |
| 审阅者 | 审计开发过程、测试和交付物 | `docs/generated/`、`docs/testing/`、`app.xlsx` |
| 维护者 | 本地运行、部署、备份、恢复 | `deploy/nginx.conf`、`scripts/backup-sqlite.sh`、`docs/ops/` |

## 3. 系统需求

### 3.1 功能需求

| ID | 需求 | 优先级 | 验证 |
|---|---|---|---|
| `FR-SDD-001` | 系统必须分页列出旅程。 | Must | `GET /api/journeys`、repository tests |
| `FR-SDD-002` | 系统必须支持 `q`、tag、MBTI、visual style、fantasy type、adventure range 筛选。 | Must | `JourneyFilter`、`journey_repo_sqlite.go` |
| `FR-SDD-003` | 系统必须按 slug 返回旅程详情、标签和 MBTI 关系。 | Must | `GET /api/journeys/:slug` |
| `FR-SDD-004` | 图片 URL 必须通过 MediaProvider 解析，前端不因本地/CDN 切换而修改代码。 | Must | `MediaProvider`、`CDN_BASE_URL` |
| `FR-SDD-005` | 注册必须包含验证码、bcrypt 密码哈希、默认 user 角色、初始积分。 | Must | `AuthHandler.Register` |
| `FR-SDD-006` | 用户、订单、支付、后台路由必须由 JWT/admin gate 保护。 | Must | `middleware.JWTAuth`、`RequireAdmin` |
| `FR-SDD-007` | 订单创建必须记录订单项价格快照和唯一订单号。 | Must | `OrderRepository.Create` |
| `FR-SDD-008` | 支付必须在事务中完成归属校验、余额校验、扣款、订单状态更新和流水插入。 | Must | `OrderRepository.Pay` |
| `FR-SDD-009` | P0 钱包/订单数据不得进入可丢 analytics buffer。 | Must | `orders`、`order_items`、`transactions` |
| `FR-SDD-010` | P2 analytics 事件可以通过 buffered batch writer 写入。 | Should | `analytics.Buffer`、`analytics_events` |
| `FR-SDD-011` | API 错误、panic、前端错误必须持久化审计。 | Must | `middleware/audit.go`、`AuditHandler` |
| `FR-SDD-012` | 管理员必须能查看真实统计并导出 CSV/JSON。 | Must | `AdminRoutes`、`AdminRepository` |
| `FR-SDD-013` | 管理员统计中的列表字段必须稳定返回 JSON array，不得因空结果变成 `null`。 | Must | `TestAdmin_Stats_EmptyMetricListsReturnArrays` |

### 3.2 非功能需求

| ID | 需求 | 验证 |
|---|---|---|
| `NFR-SDD-001` | SQLite 驱动必须是 pure Go，无 CGO。 | `modernc.org/sqlite` in `go.mod` |
| `NFR-SDD-002` | SQL 必须参数化。 | repository review/tests |
| `NFR-SDD-003` | JSON API 必须使用统一 envelope；CSV 导出为明确例外。 | API contract、handler tests |
| `NFR-SDD-004` | SQLite 写入必须使用单连接写边界与 busy retry。 | `repository.NewDB`、`repository/retry.go` |
| `NFR-SDD-005` | P2 analytics 本地 stress 必须能接收 20000 burst。 | `tests/stress` |
| `NFR-SDD-006` | 生产图片流量必须走 Nginx/CDN/R2，不把 Gin 静态直出当生产结论。 | `docs/ops/LOAD_TEST_RESULTS.md` |
| `NFR-SDD-007` | 图表和矩阵必须由 schema/routes/tests 生成或标注来源。 | `scripts/docs/generate_project_artifacts.py` |
| `NFR-SDD-008` | 生产公网必须使用 HTTPS；本地 HTTP 只作为压测夹具。 | `deploy/nginx.conf` |
| `NFR-SDD-009` | CI/CD 必须覆盖后端、前端语法、文档生成、Nginx 和 k6 smoke。 | `.github/workflows/ci.yml` |
| `NFR-SDD-010` | 数据库访问必须使用可审计的参数化 SQL，不依赖 ORM 隐式映射。 | `database/sql`、repository 层 |
| `NFR-SDD-011` | P0/P1 写入必须同步事务落库，P2 analytics 可异步缓冲。 | order/payment repos、`analytics.Buffer` |

## 4. 数据 Schema

权威 schema: `db/schema.sql`

当前核心表：

- 内容域：`journeys`、`tags`、`journey_tags`、`mbti_types`、`journey_mbti`
- 用户域：`users`、`user_points_history`、`user_saved_journeys`
- 交易域：`orders`、`order_items`、`transactions`
- 观测域：`analytics_events`、`audit_logs`

关键边界：

- `transactions` 是 P0 财务审计账本。
- `analytics_events` 是 P2，可降级，不能影响订单/支付。
- `audit_logs` 是 P1 运维证据，当前全量写入会带来 SQLite 写压力，后续可归档或异步化。
- `user_saved_journeys` 表已存在，但收藏 API/UX 尚未完成，不能在文档中写成完整功能。

## 5. 接口契约

完整契约见 `docs/schema/api-contract.md`，生成路由矩阵见 `docs/generated/api-routes.md`。

主要路由族：

- 公开内容：`GET /api/journeys`、`GET /api/journeys/:slug`、`GET /api/tags`、`GET /api/mbti`
- 认证：`GET /api/captcha`、`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/avatar`
- 订单：`POST /api/orders`、`GET /api/orders`、`GET /api/orders/:id`、`POST /api/orders/:id/pay`
- 支付：`POST /api/payments/recharge`、`GET /api/payments/transactions`
- 后台：`GET /api/admin/users`、`GET /api/admin/stats`、`GET /api/admin/export`
- 观测：`POST /api/analytics/events`、`POST /api/audit/client-error`、`GET /api/health`

JSON envelope:

```json
{ "data": {}, "error": null, "total": 0, "page": 1, "limit": 12 }
```

例外：`GET /api/admin/export?format=csv` 返回 `text/csv`。

## 6. 部署与环境约束

当前交付路径：

```text
外部浏览器
-> Tencent Cloud CVM public IP: 49.232.207.220
-> Nginx reverse proxy / static cache
-> Go Gin API
-> SQLite WAL on persistent disk
-> backup-sqlite.sh
```

中国大陆访问：

- 当前已提供腾讯云公网 IP 演示，不使用未备案域名解析到中国大陆服务器。
- 正式域名访问需完成 ICP 备案后再解析到腾讯云 CVM，并配置 HTTPS。
- 阿里云中国大陆正式公网域名部署同样通常需要 ICP 备案；未备案不作为正式域名交付路线。
- 非大陆地域可部署全栈，但大陆访问仍需实测，不等于国内优化。

## 7. 验证要求

当前证据：

- Go stress 目标组合档通过：`ok github.com/100-journeys/app/tests/stress 7.040s`
- Nginx 本地配置语法通过。
- Nginx `/api/health` 反代通过。
- Nginx `/static/assets/...` 静态图片通过。
- k6 基线详见 `docs/ops/LOAD_TEST_RESULTS.md`。

必须继续维护：

- `go test ./...`
- `go vet ./...`
- JS `node --check`
- Playwright E2E
- `.github/workflows/ci.yml` 远端真实运行结果

## 8. 需求追踪

| 需求来源 | 追踪产物 |
|---|---|
| DDL | `db/schema.sql`、`docs/generated/database-er.mmd` |
| API | `cmd/server/main.go`、`docs/generated/api-routes.md` |
| 前端路由 | `web/js/router.js`、`docs/generated/frontend-routes.md` |
| 测试 | `docs/testing/TDD-spec.md`、`docs/ops/LOAD_TEST_RESULTS.md`、`app.xlsx` |
| 部署 | `deploy/nginx.conf`、`scripts/deploy/local-one-click.sh`、`scripts/deploy/init-demo-data.sh`、`scripts/nginx/render-local-config.sh`、`docs/ops/` |

## 9. SDD 准入结论

当前 SDD 基线可以支撑“中型独立站 MVP，具备明确生产边界”的提交口径。不得声称：

- 已接入真实支付。
- 已保证中国大陆高速访问。
- 已完成收藏全链路。
- 已达到无限生产级。
- 本地 HTTP 压测等于生产 HTTPS 部署。
