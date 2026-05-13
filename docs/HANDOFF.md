# HANDOFF — 100种不可思议的旅行

> 当前更新日期: 2026-05-14
> 当前分支: `feature/taoyuan-production-readiness`
> 说明: 本文件覆盖旧交接文档中的过时结论，尤其是 E2E 全绿、后台硬编码、粒子缺失等状态。项目交付开发语境统一为：使用已接入 Kimi API 的 Claude Code 完成全部开发。

---

## 1. 项目概况

这是一个“桃源百旅 / 100种不可思议的旅行”轻量级内容展示 Web App MVP。

开发方式：本项目全部开发记录为 **接入 Kimi API 的 Claude Code** 完成。Kimi API 作为 Claude Code 本地 launcher 的模型/服务后端，Claude Code 作为工程执行环境完成需求拆解、实现、测试和文档。

定位不是普通旅行列表，而是面向 95 后 / 00 后、非典型生活方式用户、沉浸式内容用户的幻想旅行发现平台。核心体验是：

```text
心情 / MBTI / 幻想身份
-> 卡片式旅行灵感
-> 角色、任务、线索、风险、准备
-> 可购买/收藏/分享的演示型旅程
```

技术栈保持为：

- Go + Gin
- SQLite (`modernc.org/sqlite`, no CGO)
- Vanilla HTML/CSS/JS
- Hash-based SPA
- 本地静态图片，后续可接 CDN/Nginx

---

## 2. 当前已完成

### 前端体验

- 首页视觉重构为暗色、留白、神秘感路线。
- 首页加入粒子 canvas、鼠标微光、场景轮播、搜索框、情绪入口、MBTI/persona 快捷入口。
- 首页卡片使用生成图 JPG，并先用内置数据即时渲染，降低 API 等待造成的空白感。
- 卡片 hover 时底部展开简介；标题不再被遮挡。
- 探索页筛选值对齐后端枚举，避免中文显示值直接发给 API。
- 详情页加入滚动式故事场景，强化“角色/任务/线索”而不是单薄的图片和价格。
- About 页面与页脚演示用途说明已补充。
- 登录态顶栏区分普通用户和管理员。
- 后台登录入口拆为隐藏路由 `#/admin-login`，不在首页或普通导航展示。

### 后端与数据

- SQLite schema 增加 `analytics_events` 和 `audit_logs`。
- `users.gender` 已加入；用户名允许重复，唯一归属由服务端内部账户标识保证，前端个人页不展示内部数据库 ID。
- 注册密码使用 bcrypt 哈希。
- 头像上传限制 512 KB，仅允许 jpeg/png/webp，按服务端内部账户标识目录保存。
- 管理后台统计改为真实聚合。
- 管理后台支持 CSV/JSON 导出。
- 管理员账号只能通过服务器侧 CLI 创建或提升，公开注册接口不会接受管理员角色。
- API 请求、错误、panic、前端错误持久化到审计日志。
- 分析事件通过异步 buffer 批量写入。
- 订单创建、支付、余额扣减、交易流水保持事务一致性。
- SQLite 使用单连接与 busy retry，写入串行化发生在后端到 DB 边界，压测请求仍然并发。

### 测试与压力

- 新增 Go stress 测试：公共浏览、分析 buffer、订单支付、后台统计、静态图。
- 新增 50 个虚拟用户 HTTP 行为测试：注册、头像上传、充值、下单、支付、点击事件、后台统计和导出。
- 新增 k6 脚本：公共内容、注册登录、订单支付、后台统计、宠物回复、图片缓存。
- 中型独立站本地组合压测已通过：

```text
3000 浏览/API + 20000 分析事件 + 100 用户 + 500 下单支付 + 300 后台统计 + 2000 图片请求
```

- 压爆档已执行并失败，失败点集中在 Go 直出静态图片和本地 socket 连接，记录在 `docs/QUALITY_REVIEW_REPORT.md`。

---

## 3. 当前未完成 / 风险

| 优先级 | 项目 | 状态 |
|---|---|---|
| P0 | 订单/支付/钱包持久化 | 已实现事务与审计链路，仍建议继续做幂等支付测试。 |
| P1 | 后台统计 | 已真实化，仍需时间窗口和更严格漏斗定义。 |
| P1 | 日志审计 | 已持久化，后续应改成错误同步写、普通请求异步批量写。 |
| P1 | E2E 全量验证 | 2026-05-14 已经按当前动态前端复跑，Playwright `29/29` 通过。 |
| P2 | 收藏功能 | 后端 save endpoint 仍未完成 slug 解析。 |
| P2 | 静态资源生产承载 | Nginx 本地路径已修复并验证；腾讯云公网演示由 Nginx 承载静态资源，后续可接 CDN/对象存储。 |
| P2 | k6 实测 | 已完成本地 Nginx + k6 基线与重压边界记录。 |
| P2 | 20000 级瞬时分析事件 | 当前默认 buffer 32768，20000 事件压测通过。 |
| P2 | 3000 图片并发 | Gin/httptest 本地直出会超时，生产需 Nginx/CDN。 |

---

## 4. 启动与验证

开发运行：

```bash
PORT=8091 DB_PATH=./data/frontend-redesign.db go run ./cmd/server
```

常规验证：

```bash
go test ./...
go vet ./...
find web/js -name '*.js' -exec node --check {} \;
```

目标容量压力测试：

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

压爆测试：

```bash
STRESS_PUBLIC_REQUESTS=6000 \
STRESS_ANALYTICS_EVENTS=10000 \
STRESS_USERS=200 \
STRESS_ORDERS=1000 \
STRESS_ADMIN_REQUESTS=600 \
STRESS_IMAGE_REQUESTS=6000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=420s
```

---

## 5. 关键文件

```text
cmd/server/main.go                  # Gin 入口、静态资源、API、中间件
db/schema.sql                       # SQLite DDL
internal/repository/db.go           # SQLite 配置、迁移兼容
internal/repository/order_repo.go   # P0 订单与支付事务
internal/repository/user_repo.go    # 用户、钱包、头像、积分
internal/repository/admin_repo.go   # 后台统计聚合
internal/analytics/buffer.go        # P2 分析事件 buffer
internal/middleware/audit.go        # 持久化审计日志
web/js/pages/home.js                # 首页体验
web/css/pages/home.css              # 首页视觉、粒子、卡片
web/js/pages/admin.js               # Dashboard
tests/stress/stress_test.go         # Go 压力测试
tests/load/*.k6.js                  # k6 压力脚本
docs/QUALITY_REVIEW_REPORT.md       # 当前工程质量与压测报告
```

---

## 6. 后续建议

1. 补完整 Playwright E2E，特别是 captcha-aware 注册登录、下单支付、后台权限。
2. 安装 k6 并执行 6 份脚本，保存终端输出到测试报告。
3. 收藏功能要么实现 API，要么明确降级为 localStorage。
4. 保持 Nginx/CDN 部署说明和静态资源缓存验证与当前代码同步。
5. 如果目标变成真实生产交易系统，SQLite 应升级为持久化队列/outbox + worker 或服务端数据库。
6. 生产预案见 `docs/ops/PRODUCTION_READINESS.md` 与 `docs/ops/DISASTER_RECOVERY.md`。
