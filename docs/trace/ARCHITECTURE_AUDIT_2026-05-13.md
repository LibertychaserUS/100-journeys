# 架构审计报告 — 100 Journeys
> Date: 2026-05-13 | Phase: v1.0.0 MVP Complete

---

## 1. 分层与解耦 ✅ 良好

```
HTTP Request
    ↓
handler (Gin) — HTTP concerns only: bind, validate, envelope JSON
    ↓
service — business logic: defaults, image URL resolution, error mapping
    ↓
repository — data access: SQL queries, joins, preloading
    ↓
model — pure structs, no logic
    ↓
SQLite
```

| 层级 | 接口 | 注入点 | 状态 |
|------|------|--------|------|
| Repository | `JourneyRepository` | `main.go:53` | ✅ 接口隔离 |
| Media | `MediaProvider` | `main.go:54` | ✅ 可替换 Local/CDN |
| AI | `ai.Provider` | `main.go:58` | ✅ Mock ↔ 真实模型可插拔 |
| Recommend | `RecommendEngine` | `main.go:57` | ✅ 依赖 Repository 接口 |

**结论**: 解耦符合依赖倒置原则。可测试性已通过 43 个单元/集成测试验证。

---

## 2. Middleware 覆盖 ⚠️ 严重不足

当前只有 **1 个 middleware** (CORS, inline 在 main.go:64)。

| Middleware | 存在 | 位置 | 风险 |
|------------|------|------|------|
| CORS | ✅ | main.go | 允许 `*`  origin，生产环境不安全 |
| Request Logging | ❌ | — | 无法追踪请求链路 |
| Recovery (panic catch) | ❌ | — | 单个 panic 会崩溃整个进程 |
| Rate Limiting | ❌ | — | 无防刷保护 |
| Auth / JWT | ❌ | — | 所有 API 完全开放 |
| Request ID | ❌ | — | 无法关联日志 |
| Metrics / Prometheus | ❌ | — | 无运行时监控 |

---

## 3. Event Loop / Event Bus ❌ 不存在

| 组件 | 状态 | 说明 |
|------|------|------|
| 后端 Event Bus | ❌ | 无 pub/sub，无领域事件 |
| 前端 Event Bus | ❌ | 无自定义事件系统，纯 DOM 事件 |
| Event Loop (JS) | ⚠️ | 浏览器原生事件循环，无业务级调度 |

**影响**: 模块间全部直接调用，无松耦合通信机制。例如：
- AI Pet 聊天无法触发页面刷新
- 收藏按钮状态无法跨页面同步
- 过滤器变更无法广播给其他组件

---

## 4. 缺失系统清单 (你提到的需求)

| 需求 | 状态 | 复杂度 | 依赖 |
|------|------|--------|------|
| Nginx 反向代理 | ❌ | 低 | 部署配置 |
| 用户系统 (注册/登录/JWT) | ❌ | 高 | 新表 + middleware + 前端页面 |
| 用户信息加密存储 | ❌ | 中 | bcrypt/argon2 + HTTPS |
| 管理员 Dashboard | ❌ | 高 | 权限系统 + 新路由 + 新页面 |
| 复杂验证码 (图形/行为) | ❌ | 中 | 第三方库或自研 |
| 用户等级 + 积分系统 | ❌ | 高 | 用户表扩展 + 积分规则引擎 |
| 用户主页 (Profile) | ❌ | 中 | 用户系统 + 新页面 |

---

## 5. 代码质量风险

| 风险项 | 位置 | 等级 |
|--------|------|------|
| CORS `Allow-Origin: *` | main.go:65 | 🔴 高 |
| 无 panic recovery | main.go | 🔴 高 |
| SQL 拼接 (buildJoins) | journey_repo_sqlite.go:210 | 🟡 中 — 但仅 filter 字段可控 |
| 无 API 认证 | 全部 `/api/*` | 🔴 高 |
| 密码明文存储 | — | 🔴 高 — 用户系统尚未实现 |
| 无请求日志 | — | 🟡 中 |
| AI 是 Mock (硬编码规则) | mock_ai.go | 🟡 中 — 非真实 LLM |

---

## 6. 建议优先级

**P1 (安全基线)**:
1. 添加 Recovery middleware
2. 添加 Request Logging middleware
3. 替换 CORS `*` 为白名单
4. Nginx 反向代理 + HTTPS

**P2 (用户系统)**:
5. 用户表 + JWT Auth middleware
6. 注册/登录 API + 页面
7. bcrypt 密码存储

**P3 (业务扩展)**:
8. 管理员 Dashboard
9. 用户等级 + 积分
10. 用户主页
11. 复杂验证码
12. Event Bus (前后端)
