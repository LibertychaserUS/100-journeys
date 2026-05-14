# 100种不可思议的旅行 — 完整开发时间线

> 按时间顺序记录从项目初始化到 v1.2.0 的全部开发节点。
> 生成时间: 2026-05-13
> 当前状态以 `docs/trace/CURRENT_STATE.md` 和 `docs/QUALITY_REVIEW_REPORT.md` 为准；历史节点中的旧测试声明不代表当前分支最新验证结果。

---

## Phase 0: 项目骨架 (2026-05-13 16:23–16:27)

| 时间 | Commit | 内容 |
|---|---|---|
| 16:23 | `705280d` | **chore: initialize project skeleton** — 项目初始化，目录结构搭建 |
| 16:27 | `421b6db` | **docs: establish full SDD/DDD/TDD/trace doc framework** — 建立 SDD/DDD/TDD 文档框架 |
| 16:27 | `51b6289` | **docs: add CLAUDE.md** — 添加项目约束与治理文件 |

**交付物:**
- `CLAUDE.md` — 项目规范与技术栈锁定
- `docs/schema/` — SDD 文档目录
- `docs/ui-components/` — DDD 文档目录
- `docs/testing/` — TDD 文档目录
- `docs/trace/` — 追踪与检查点目录

---

## Phase 1: SDD — 系统设计与数据库建模 (16:47–17:26)

| 时间 | Commit | 内容 |
|---|---|---|
| 16:47 | `bf8556f` | **docs: add wireframes, execution plan, and design direction** — 线框图与执行计划 |
| 17:09 | `fc4d115` | **docs: add system design DAG + worktree setup** — 系统设计 DAG 图与工作区配置 |
| 17:10 | `eb3b15a` | **fix: worktrees are not submodules, add to gitignore** — 修复 worktree 配置 |
| 17:21 | `44ea70c` | **feat(sdd): schema v1.1 + Go module + backend skeleton** — 数据库 Schema v1.1 + Go 模块初始化 |
| 17:25 | `cad34b9` | **feat(sdd): complete backend implementation v1.0** — 完成后端核心实现 |
| 17:26 | `01e85c2` | **docs: add FEATURE_ROADMAP.md v1.0** — 功能路线图冻结 |

**交付物:**
- `db/schema.sql` — SQLite 数据库 Schema（journeys, tags, mbti_types 等）
- `db/seed.sql` — 初始 5 条旅程种子数据
- `cmd/server/main.go` — Go 后端骨架
- `internal/repository/` — 数据访问层
- `internal/service/` — 业务逻辑层
- `internal/handler/` — HTTP 处理器
- **Git Tag:** `v0.0.0-skeleton`

---

## Phase 2: DDD — 前端设计与组件实现 (17:36–17:45)

| 时间 | Commit | 内容 |
|---|---|---|
| 17:36 | `2705f21` | **feat(ddd): shared CSS components + AI Pet + Home page** — 共享 CSS 组件 + AI 宠物 + 首页 |
| 17:41 | `eb3f850` | **feat(ddd): complete frontend — Explore + Detail pages** — 探索页 + 详情页完成 |
| 17:45 | `988b0e3` | **trace: update DEVELOPMENT_LOG + CURRENT_STATE for DDD completion** — DDD 阶段检查点 |

**交付物:**
- `web/css/tokens.css` — 设计 Token 体系
- `web/css/global.css` — 全局样式
- `web/css/components/` — 共享组件样式
- `web/js/pages/home.js` — 首页（Hero + 精选旅程）
- `web/js/pages/explore.js` — 探索页（筛选 + 卡片网格）
- `web/js/pages/detail.js` — 旅程详情页
- **Git Tag:** `v0.2.0-ddd`

---

## Phase 3: TDD — 测试驱动开发 (17:58–17:59)

| 时间 | Commit | 内容 |
|---|---|---|
| 17:58 | `4481ed3` | **feat(tdd): complete test suite — unit + integration tests** — 单元测试 + 集成测试 |
| 17:59 | `f1e3862` | **trace: update DEVELOPMENT_LOG + CURRENT_STATE for TDD completion** — TDD 阶段检查点 |

**交付物:**
- `internal/repository/journey_repo_sqlite_test.go` — 仓库层单元测试
- `internal/handler/*_test.go` — HTTP 处理器集成测试
- `tests/unit/` — 单元测试目录
- `tests/integration/` — 集成测试目录
- **Git Tag:** `v0.3.0-tdd`

---

## Phase 4: E2E — 端到端测试 (18:24–18:28)

| 时间 | Commit | 内容 |
|---|---|---|
| 18:24 | `b358f69` | **feat(e2e): complete Playwright E2E suite — 17/17 passing** — Playwright E2E 测试 suite |
| 18:28 | `1e6c2ef` | **trace: architecture audit + bug discovery record + E2E checkpoint** — 架构审计与 E2E 检查点 |

**交付物:**
- `e2e/` — Playwright 端到端测试（17 个测试用例全部通过）
- `docs/trace/DEVELOPMENT_LOG.md` — 开发日志更新
- **Git Tag:** `v1.0.0`

---

## v1.1.0: 用户系统 + 订单支付 (18:35–20:02)

| 时间 | Commit | 内容 |
|---|---|---|
| 18:35 | `74d750e` | **feat(auth): user system backend — JWT + bcrypt + points** — JWT 认证 + bcrypt + 积分系统 |
| 18:37 | `a7c3caf` | **feat(auth): frontend login/register pages + nav auth state** — 前端登录/注册页 + 导航状态 |
| 18:40 | `8ec1485` | **feat(admin+profile): admin dashboard + user profile pages** — 管理员控制台 + 用户资料页 |
| 20:00 | `c5b7033` | **feat(v1.1.0): order & payment system, virtual currency, points/levels** — 订单支付 + 虚拟货币 + 等级 |
| 20:02 | `98305c5` | **docs(README): industrialize with badges, ER diagram, features, API overview** — README 工业化 |

**关键功能:**
- JWT 认证（`github.com/golang-jwt/jwt/v5`）
- bcrypt 密码哈希
- 用户积分与等级系统
- 虚拟不思议币充值与消费
- 订单系统（购物车 → 订单 → 支付）
- 交易记录查询
- 管理员 Dashboard（数据统计）
- 用户 Profile 页（资料 + 订单 + 交易）

---

## v1.1.5: 文档国际化 (20:17)

| 时间 | Commit | 内容 |
|---|---|---|
| 20:17 | `ac73cde` | **docs(README): bilingual Chinese-English** — README 中英双语 |

---

## v1.2.0: 功能扩展与体验优化 (20:23–21:21)

### P3-5: 基础设施与架构增强

| 时间 | Commit | 内容 |
|---|---|---|
| 20:23 | `49df175` | **.github/workflows/pages.yml** — GitHub Pages 部署 Workflow |
| 20:41 | `ac574ae` | **feat(v1.2.0): captcha, 404, event bus, nginx, workflow node24 fix** — 验证码 + 事件总线 + Nginx |

**技术实现:**
- **Captcha**: `crypto/rand` 数学验证码，内存存储 5 分钟 TTL
- **Event Bus**: Go channel 发布订阅 + JS EventEmitter
- **Nginx**: gzip + 安全头 + 速率限制
- **GitHub Actions**: 修复 Node.js 20 弃用警告

### P4-4: 错误处理与权限硬化

| 时间 | Commit | 内容 |
|---|---|---|
| 20:53 | `09fbb01` | **feat(v1.2.0): universal error pages, role guards, one-click startup** — 通用错误页 + 权限 + 启动脚本 |

**技术实现:**
- 通用错误页（403/500/503/offline/timeout）
- 用户角色三级分野：游客 / 用户 / 管理员
- 管理员页面双重校验（登录 + admin 角色）
- `start.sh` 一键本地启动脚本

### P4-6: 体验打磨

| 时间 | Commit | 内容 |
|---|---|---|
| 21:03 | `6ef4b88` | **fix(start.sh): add executable permission** — 修复脚本权限 |
| 21:20 | `48df968` | **feat(v1.2.0): real images, 12 journeys, log noise reduction, card hover FX** — 真实图片 + 12 旅程 + 动效 |
| 21:21 | `ca1936b` | **fix(workflow): revert to origin version to allow push** — 恢复 workflow 以通过推送 |

**技术实现:**
- 14 张 Unsplash 高质量真实图片下载
- Seed 数据从 5 条扩展至 12 条旅程
- 终端日志降噪（跳过 `/static/` 请求日志）
- 首页 stats bar（12 旅程 / 7 大洲 / 16 MBTI / 无限）
- 卡片悬浮动效（translateY + scale + shadow 层次）
- 卡片 Hover 故事摘要 overlay 浮现

---

## 累计统计

| 指标 | 数值 |
|---|---|
| 总提交数 | 28 commits |
| 开发时间 | ~5 小时（16:23–21:21） |
| 后端测试 | 51 tests 全部通过 |
| E2E 测试 | 17/17 passing |
| 旅程数据 | 12 条（覆盖 7 大洲） |
| 图片资源 | 14 张 Unsplash 高清图 |
| 前端页面 | 10+ 独立路由页面 |
| API 端点 | 20+ RESTful endpoints |

---

## 版本演进

```
v0.0.0-skeleton → v0.1.0-sdd → v0.2.0-ddd → v0.3.0-tdd → v1.0.0-e2e → v1.1.0-auth+orders → v1.2.0-expansion
```

## 待完成功能（Next）

- [ ] MBTI 宠物专属互动（用户页隐藏款）
- [ ] 深色 / 白天模式切换 + 跟随系统
- [ ] 自动登录 / Remember Me
- [ ] 用户角色用例图（游客/用户/管理员）
- [ ] 正文背景微动效
- [ ] Supabase PostgreSQL + Render 全栈部署
