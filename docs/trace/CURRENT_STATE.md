# Current State — 100 Journeys

> 本文件记录当前开发分支的真实状态。不要把旧文档中的“全部通过”当作当前结论。

---

## 分支与范围

- **日期**: 2026-05-14
- **分支**: `feature/taoyuan-production-readiness`
- **工作树**: `.worktrees/frontend-redesign`
- **基线策略**: baseline 不直接修改，本分支独立开发。
- **技术栈**: Go + Gin + SQLite (`modernc.org/sqlite`) + Vanilla HTML/CSS/JS Hash SPA。
- **开发工具语境**: 全部开发记录为使用已接入 Kimi API 的 Claude Code 完成；Kimi API 是 Claude Code 本地 launcher 的模型/服务后端。

## 当前功能状态

| 模块 | 状态 | 说明 |
|---|---|---|
| 首页视觉 | 已重构 | “桃源百旅”暗色极简风格，生成图、粒子、鼠标微光、搜索与情绪入口。 |
| 探索页 | 已修正 | 筛选值对齐后端枚举，图片使用本地生成 JPG。 |
| 详情页 | 已增强 | 增加滚动式故事场景、角色/任务/线索表达。 |
| 注册/登录 | 已增强 | 注册包含用户名、性别、头像上传；密码 bcrypt 哈希。 |
| 顶栏登录态 | 已增强 | 普通用户显示头像、用户名、钱包、积分；管理员显示后台入口。 |
| 管理后台 | 已真实化 | 聚合用户、订单、钱包、积分、点击、购买、MBTI、性别、审计日志。 |
| 审计日志 | 已增加 | API 请求、错误、panic、前端错误写入 `audit_logs`。 |
| 分析事件 | 已增加 | 点击/搜索/筛选/浏览/宠物事件进入 `analytics_events`。 |
| 订单/钱包 | 已加固 | 事务支付、交易流水、SQLite 单写边界、busy retry。 |
| 收藏功能 | 未完成 | 后端接口仍需补全 slug 到 journey_id 的解析。 |
| Nginx/CDN | 本地与腾讯云 Nginx 已验证 | 本地 Nginx 已代理 HTML/API 并直出静态资源；腾讯云公网 IP 已上线，API 入口有限流保护，正式域名/HTTPS 仍需备案后补。 |

## 验证状态

| 命令 | 结果 |
|---|---|
| `go test ./...` | 通过 |
| `go vet ./...` | 通过 |
| `find web/js -name '*.js' -exec node --check {} \;` | 通过 |
| `go test -tags stress ./tests/stress -run TestStress -count=1` | 通过，中型独立站参数已刷新 |
| `k6 run tests/load/public-content-flow.k6.js` | 腾讯云公网限流内 smoke 通过 |
| `go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s` | 中型独立站本地组合档通过 |
| `go test -tags stress ./tests/stress -run TestStressStaticImageDelivery` with `STRESS_IMAGE_REQUESTS=3000` | 失败，暴露 Go 直出静态图瓶颈 |
| `k6 run ...` | 未执行，本机未安装 `k6` |
| `cd e2e && npx playwright test` | 29/29 通过 |

目标容量压测参数：

```bash
STRESS_PUBLIC_REQUESTS=3000
STRESS_ANALYTICS_EVENTS=20000
STRESS_USERS=100
STRESS_ORDERS=500
STRESS_ADMIN_REQUESTS=300
STRESS_IMAGE_REQUESTS=2000
```

结果：

```text
ok github.com/100-journeys/app/tests/stress 15.271s
```

压爆档参数：

```bash
STRESS_PUBLIC_REQUESTS=6000
STRESS_ANALYTICS_EVENTS=10000
STRESS_USERS=200
STRESS_ORDERS=1000
STRESS_ADMIN_REQUESTS=600
STRESS_IMAGE_REQUESTS=6000
```

结果：失败。主要瓶颈是本地极端并发 socket 连接和 Go 直出静态图片。P2 分析 buffer 已提升到 32768，20000 事件压测通过。

## 关键设计边界

- P0 订单、支付、钱包不经过可丢 buffer，必须事务落库。
- P1 用户、后台统计、日志审计可接受短延迟，但必须可追踪。
- P2 点击、宠物、浏览行为可以批量写入，超过容量时允许降级，不影响核心交易。
- 当前 SQLite 使用单连接避免写锁踩踏；压测仍然并发发起，串行化发生在后端到 DB 的写入边界。
- 中型独立站生产预案见 `docs/ops/PRODUCTION_READINESS.md` 和 `docs/ops/DISASTER_RECOVERY.md`。

## 下一步

1. 补收藏功能或明确降级为 localStorage。
2. 域名备案完成后补正式域名、HTTPS 证书和 80 -> 443 跳转截图。
3. 备份文件复制到异机、对象存储或另一块持久化盘，并完成一次恢复演练。
4. 若继续要求生产级高并发交易，迁移到服务端数据库或增加持久化 outbox/job worker。
