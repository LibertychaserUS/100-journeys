# 工程质量与生产压力审查报告

**日期**: 2026-05-14  
**范围**: 前端体验、后端 API、SQLite 数据一致性、后台统计、日志审计、压力测试与部署风险。  
**结论**: 当前分支已从“演示原型”推进到“可验证 MVP 分支”，但还不是高并发生产系统。目标课堂/作业容量已通过本地压力验证；继续向真实生产推进时，静态资源、日志写入和 SQLite 单写模型仍是主要瓶颈。

---

## 1. 本轮关键改动

- 首页改为更简洁的“桃源百旅”暗色视觉：大标题轮播、真实生成图、轻粒子、鼠标微光、搜索与情绪入口。
- 修复图片路径与加载策略：生成图改用本地 JPG，首页先用内置 journey 数据即时渲染，再与 API 同步。
- 修复卡片标题被遮挡问题：卡片标题常驻可见，简介仅在 hover 时从底部展开。
- 登录态顶栏区分普通用户和管理员：普通用户显示头像、用户名、虚拟钱包、积分；管理员显示后台入口。
- 注册页补充用户名、性别、头像上传；头像按用户唯一 ID 存放，用户名允许重复，邮箱仍唯一。
- 后台 Dashboard 改为真实数据统计：用户数、旅程数、钱包余额、积分、订单、收入、审计日志、事件数、热门点击/购买、MBTI、性别分布。
- 增加后台导出接口：`GET /api/admin/export?format=csv|json`。
- 后台入口从普通导航拆出：`#/admin-login` 为隐藏入口，游客和普通用户在主页/导航看不到 Dashboard。
- 管理员账号只能通过服务器侧 CLI 创建或提升；公开注册接口即使注入 `role=admin` 也只会生成普通用户。
- 增加持久化审计日志：API 请求、错误、前端 `error/unhandledrejection` 写入 `audit_logs`。
- 增加异步分析事件缓冲：点击、搜索、筛选、旅程浏览、宠物回复写入 `analytics_events`。
- P0 订单/支付/钱包链路保持事务写入：订单、交易流水、余额扣减同事务完成，并通过 SQLite 单连接和 busy retry 避免写锁踩踏。

---

## 2. 系统设计真实现状

### 2.1 Nginx / 静态资源层

当前仓库没有运行中的 Nginx。实际运行方式是：

```text
Browser -> Gin 静态文件 / Gin API -> SQLite
```

这对本地演示足够，但不适合把 3 MB 级图片和 API 全部压在 Go 进程上长期承载。生产建议：

- 静态图片放到 CDN 或 Nginx 静态目录，Go 只负责 API。
- Nginx/CDN 开启 `Cache-Control: public, max-age=31536000, immutable`。
- API 由 Nginx 反向代理到 Gin，并增加请求体大小、超时、限流配置。

### 2.2 Middleware

实际存在并有意义的中间件：

- `RequestID`: 每个请求生成可追踪 ID。
- `AuditRecovery`: 捕获 panic 并持久化审计日志。
- `AuditLogger`: 持久化 API 请求、状态码、延迟和错误。
- `CORS`: 本地/部署跨域控制。
- `JWTAuth`: 登录态校验。
- `RequireAdmin`: 管理员接口鉴权。

注意：当前 `AuditLogger` 会对每个 API 请求写库。它满足“可审计”，但在更高并发下会增加 SQLite 写压力。若继续提升吞吐，应改为“错误同步写 + 普通请求批量异步写 + 本地文件轮转兜底”。

### 2.3 Event Bus

实际存在的是进程内异步事件总线，用于非关键通知：

```text
UserRegistered / OrderPaid -> in-memory event bus -> subscriber side effects
```

它不是持久化消息队列，不应承载 P0 财务一致性。当前设计是正确的：P0 先落 SQLite 事务，事件只在提交成功后发布。

### 2.4 Buffer / Queue

当前 buffer 只用于 P2 分析事件：

```text
frontend click/search/pet event -> analytics buffer -> batch insert -> analytics_events
```

默认容量为 32768，已通过 20000 个瞬时分析事件压测。超过容量时会拒收 P2 事件，不影响订单和钱包。

P0 写入的“串行化”不是把压测脚本串行，而是在后端到 SQLite 边界执行：

```text
many concurrent HTTP requests
-> repository transaction
-> SQLite single-writer connection + busy retry
-> durable orders / transactions / users
```

这符合 SQLite 的单写模型。若未来要承载真实生产规模，应升级为“持久化 job/outbox 表 + 后台 worker”或迁移到服务端数据库。

### 2.5 Event Loop

后端是 Go runtime，不是 Node.js event loop。并发模型是 goroutine + database/sql 连接池。前端仍是浏览器 event loop，粒子、滚动动画和 API 请求都运行在浏览器主线程上，因此动画必须轻量化。

---

## 3. 数据库与审计设计

新增/调整表：

- `analytics_events`: 记录点击、搜索、筛选、浏览、宠物回复。
- `audit_logs`: 记录 API 请求、错误、panic、前端错误。
- `users.gender`: 用于用户性别分布和购买性别分布统计。
- `users.username`: 允许重复，真实唯一身份由 `users.id` 保证。

P0 持久化链路：

```text
orders
-> order_items
-> transactions
-> users.balance
```

支付使用事务，余额不足、订单归属错误、订单非 pending 均会失败并回滚。订单号加入随机后缀并保留唯一约束，压力测试中未出现订单号碰撞。

头像存储建议：

- 当前实现：文件系统保存头像，DB 只保存 `avatar_url`。
- 不建议把头像二进制直接塞进 SQLite。原因是会放大 DB 文件、拖慢备份和查询。
- 更合理的演进：本地文件/CDN/Object Storage 存图片，DB 存 `user_id`、URL、mime、size、hash、created_at。当前 MVP 已按用户 ID 分目录：`/uploads/avatars/u_<id>/avatar.ext`。

---

## 4. 压力测试结果

### 4.1 常规验证

| 命令 | 结果 |
|---|---|
| `gofmt` | 已执行 |
| `go test ./...` | 通过 |
| `go vet ./...` | 通过 |
| `find web/js -name '*.js' -exec node --check {} \;` | 通过 |
| `go test ./internal/handler -run TestAdmin_StatsAndExport_ReflectsFiftyVirtualUsersThroughHTTPBehavior -count=1` | 通过，50 个普通用户 + 3 个管理员账号，真实 HTTP 行为链路输入 |
| `k6 ...` | 未执行，当前环境未安装 `k6` |

### 4.2 中型独立站组合压力测试

命令：

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

结果：

```text
ok github.com/100-journeys/app/tests/stress 15.271s
```

覆盖：

- 3000 次公共浏览/API 请求。
- 20000 个分析事件进入 buffer 并落库。
- 100 个用户基础数据。
- 500 个订单创建 + 支付 + 交易流水审计。
- 300 次管理员统计接口读取。
- 2000 次本地静态图片请求。
- 50 个普通虚拟用户通过 HTTP 注册、头像上传、充值、下单、支付、点击事件输入后台统计测试。

### 4.3 Buffer 专项压力测试

RED:

```text
STRESS_ANALYTICS_EVENTS=20000
expected at least 20000 analytics events, got 8192
```

GREEN:

```text
ok github.com/100-journeys/app/tests/stress 3.513s
```

结论：旧 8192 buffer 容量不足；默认容量提升到 32768 后，20000 瞬时 P2 事件不丢。

### 4.4 压爆测试

命令：

```bash
STRESS_PUBLIC_REQUESTS=6000 \
STRESS_ANALYTICS_EVENTS=10000 \
STRESS_USERS=200 \
STRESS_ORDERS=1000 \
STRESS_ADMIN_REQUESTS=600 \
STRESS_IMAGE_REQUESTS=6000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=420s
```

结果：失败，约 21.5 秒出现爆点。

主要失败类型：

- `connect: operation timed out`: 本地 `httptest` + 操作系统 socket backlog 被极端并发连接打满。
- 静态图片 6000 并发请求超时：Go 进程直出本地图片不是生产级静态资源方案。

解释：

这不是压测被串行化，而是并发足够大后暴露出的真实瓶颈。P0 订单目标档通过；爆点集中在本地网络连接和静态资源服务。Buffer 爆点已通过容量提升修复到 20000 事件档。

---

## 5. 后台 Dashboard 统计口径

当前 Dashboard 数据来源：

- 用户数、等级、余额、积分：`users`
- 订单数、购买率、收入：`orders`
- 商品购买排行：`order_items`
- 点击排行、MBTI、事件数：`analytics_events`
- 错误数、审计日志数：`audit_logs`
- 用户性别分布：`users.gender`
- 购买性别分布：`orders JOIN users`

后台访问策略：

- 游客和普通用户不在主页/导航看到 Dashboard 或后台登录入口。
- `#/admin` 未登录时跳转 `#/admin-login`。
- 普通账号登录后台入口会被拒绝并清除 token。
- 管理员账号通过 `cmd/admin-user` CLI 在服务器侧创建或提升，不通过公开注册入口。

展示原则：

- 保持简洁，不做复杂 BI。
- 每 5 秒刷新一次。
- 支持 CSV/JSON 导出，便于 CLI 或 API 侧归档。
- 未登录或非管理员不显示后台数据。

仍需改进：

- 历史用户没有性别时只能归入 `prefer_not_to_say`。
- 购买率的定义目前是 `购买次数 / 点击次数` 的近似值，不是严格漏斗。
- 未来可加入时间窗口：今日、7 日、30 日。

---

## 6. 仍然存在的风险

- SQLite 单写模型适合作业 MVP 和小流量演示，不适合长期高并发交易系统。
- 20000 级瞬时分析事件已通过；超过 32768 默认容量时仍会按 P2 降级策略拒收。
- 所有 API 请求都持久化审计会增加写入压力，生产应做异步批量和日志文件兜底。
- 本地 Go 进程直出大图在高并发下会慢，生产应使用 CDN/Nginx。
- 当前没有实际 Nginx 部署文件和真实线上压测环境。
- `k6` 脚本已准备，但本机未安装 `k6`，因此本轮只执行了 Go 压力测试。
- 中型独立站生产预案已补充：`docs/ops/PRODUCTION_READINESS.md`、`docs/ops/DISASTER_RECOVERY.md`。

---

## 7. 提交就绪判断

**判断**: 几乎可提交作业演示，但还不是生产级系统。

适合提交的部分：

- 产品方向更接近“曲径通幽、桃花源、年轻用户幻想旅行”。
- 搜索、筛选、卡片、详情、登录态、管理员统计、审计日志均有可运行实现。
- SQLite 被真实使用，订单/钱包有持久化和审计链路。
- 压力测试覆盖了公共浏览、分析事件、订单支付、后台统计和静态图片。

提交前建议再做：

- 用真实浏览器跑一次完整 E2E。
- 安装并运行 `k6` 脚本，保留报告截图或终端输出。
- 将静态图片部署到 CDN/Nginx 方案写进部署文档。
- 不把本地指令文件、临时缓存、内部工具痕迹提交到公开仓库。
