# 测试计划 - 100 Journeys

**文档语言**: 中文
**对齐标准**: ISO/IEC/IEEE 29119-3 测试计划 / 测试过程 / 测试结果记录
**更新日期**: 2026-05-14
**执行范围**: 单元测试、集成测试、浏览器 E2E、Go stress、k6 负载、Nginx 代理验证、CI smoke
**证据索引**: `docs/ops/LOAD_TEST_RESULTS.md`、`docs/generated/test-evidence.md`

---

## 1. 测试计划摘要

本计划用于指导 `feature/taoyuan-production-readiness` 分支的测试执行。测试结论必须区分：

- **已通过**: 本轮执行过，并有命令、退出码或关键输出。
- **容量边界**: 功能正确但延迟或阈值被打穿。
- **未执行**: 工具、环境或范围不满足，不能写成通过。
- **历史证据**: 上一会话结果，只能作参考。

## 2. 被测范围

| 层级 | ID 前缀 | 工具 | 覆盖范围 |
|---|---|---|---|
| 单元测试 | `UT-*` | Go `testing` | repository、service、AI、middleware、analytics buffer |
| 集成测试 | `IT-*` | Go `testing` + Gin/SQLite helper | handler、认证、后台、订单、支付、健康检查 |
| 浏览器端到端 | `E2E-*` | Playwright | Hash SPA 页面和用户流程 |
| Go 压力测试 | `STRESS-*` | Go build tag `stress` | API 并发、订单支付、后台统计、静态资源 |
| k6 负载测试 | `LOAD-K6-*` | k6 | 运行中服务经 Nginx 代理后的 API/静态资源压力 |
| Nginx 验证 | `NGINX-*` | nginx/curl/k6 | 语法、反向代理、缓存、健康检查 |
| CI/CD | `CI-*` | GitHub Actions | 自动化回归、文档生成一致性、Nginx smoke、k6 smoke |

## 3. 当前代码事实

后端实际路由来自 `cmd/server/main.go` 与 handler 注册：

- 公开接口：`/api/journeys`、`/api/journeys/:slug`、`/api/journeys/:slug/book`、`/api/tags`、`/api/mbti`、`/api/ai/chat`、`/api/analytics/events`、`/api/audit/client-error`、`/api/health`、`/api/captcha`、`/api/auth/register`、`/api/auth/login`。
- 受保护接口：`/api/auth/me`、`/api/auth/avatar`。
- 后台接口：`/api/admin/users`、`/api/admin/stats`、`/api/admin/export`。
- 订单接口：`/api/orders`、`/api/orders/:id`、`/api/orders/:id/pay`。
- 支付接口：`/api/payments/recharge`、`/api/payments/transactions`。

前端实际路由来自 `web/js/router.js`：`#/`、`#/explore`、`#/journey/:slug`、`#/login`、`#/register`、`#/profile`、`#/admin-login`、`#/admin`、`#/recharge`、`#/about`。

## 4. 标准测试过程

### 4.1 基础回归

```bash
GOCACHE="$PWD/.cache/go-build" go test ./...
GOCACHE="$PWD/.cache/go-build" go vet ./...
find web/js -name '*.js' -exec node --check {} \;
```

### 4.2 文档生成一致性

```bash
python3 scripts/docs/generate_project_artifacts.py
git diff --exit-code -- docs/generated
```

### 4.3 Go stress 目标组合档

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

### 4.4 Nginx + k6

```bash
scripts/nginx/render-local-config.sh 18080 18081
nginx -t -c "$PWD/deploy/nginx.local.conf" -p "$PWD/.nginx"
PORT=18081 DB_PATH=./data/nginx-k6.db go run ./cmd/server
nginx -c "$PWD/deploy/nginx.local.conf" -p "$PWD/.nginx"

BASE_URL=http://127.0.0.1:18080 VUS=200 DURATION=30s k6 run tests/load/public-content-flow.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=40 DURATION=30s k6 run tests/load/auth-register-login.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=80 DURATION=30s k6 run tests/load/order-payment-audit.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=200 DURATION=30s k6 run tests/load/pet-chat-analytics.k6.js
BASE_URL=http://127.0.0.1:18080 VUS=300 DURATION=30s k6 run tests/load/image-static-cache.k6.js
BASE_URL=http://127.0.0.1:18080 ADMIN_TOKEN=... VUS=10 DURATION=30s k6 run tests/load/admin-analytics-export.k6.js
```

### 4.5 浏览器 E2E

```bash
cd e2e
npx playwright test
```

本轮已完成独立浏览器视觉审查；完整 Playwright 脚本已按当前动态前端刷新，结果为 29/29 通过。

## 5. 本轮测试结果

| 项目 | 本轮状态 | 证据摘要 |
|---|---|---|
| 文档生成 | 通过 | `python3 scripts/docs/generate_project_artifacts.py` 写出 `docs/generated/*` |
| Nginx 语法 | 通过 | `nginx: configuration file ... test is successful` |
| Nginx API 反代 | 通过 | `/api/health` 返回 `{"data":{"status":"ok"},"error":null}` |
| Nginx 静态 CSS/JS | 通过 | `/static/css/tokens.css` 为 `text/css`，`/static/js/router.js` 为 `application/javascript` |
| Nginx 静态图片 | 通过 | `/static/assets/images/generated/hero-taoyuan.jpg` 返回 `200 OK`，`Content-Length: 451823`，有 cache header |
| Nginx 默认头像 | 通过 | `/static/assets/images/avatars/github-default/avatar-00.svg` 返回 `image/svg+xml` |
| Go stress | 通过 | 目标组合档输出 `ok github.com/100-journeys/app/tests/stress 7.040s` |
| k6 public | 通过 | 200 VU / 30s，39193 请求，失败率 0，p95 61.21 ms |
| k6 image | 通过 | 300 VU / 30s，9000 请求，失败率 0，p95 17.92 ms |
| k6 pet/analytics | 通过 | 200 VU / 30s，12000 请求，失败率 0，p95 8.87 ms |
| k6 order/payment | 通过 | 80 VU / 30s，10240 请求，失败率 0，p95 574.66 ms |
| k6 auth 基线 | 通过 | 40 VU / 30s，2964 请求，失败率 0，p95 437.77 ms |
| k6 auth 重压 | 容量边界 | 120 VU / 30s，功能 100% 通过但 p95 约 2s，阈值失败 |
| k6 admin 基线 | 通过 | 10 VU / 30s，852 请求，失败率 0，p95 94.61 ms |
| k6 admin 重压 | 容量边界 | 60 VU / 30s，功能 100% 通过但 p95 598.95 ms，阈值失败 |
| 浏览器视觉审查 | 已执行 | 已捕获桌面/移动、个人页、充值页、后台 dashboard 截图 |
| Playwright | 通过 | `29 passed`，包含 captcha-aware 注册登录、充值、下单支付、订单和流水 |
| 全量 `go test ./...` / `go vet ./...` / JS check | 通过 | 管理员统计契约修复后已最终复跑 |

## 6. 本轮缺陷与修复

| ID | 类型 | 现象 | 修复 |
|---|---|---|---|
| `BUG-NGINX-STATIC-001` | 配置缺口 | 代码真实路径包含 `/static/css/...`、`/static/js/...`、`/static/assets/...`，Nginx 初版未完整覆盖 | `deploy/nginx.conf` 与 `scripts/nginx/render-local-config.sh` 增加 `/static/css/`、`/static/js/`、`/static/assets/` |
| `BUG-ADMIN-JSON-001` | API 契约 | 空榜单可能编码为 `null`，k6 期望数组 | `AdminStats` 聚合结果初始化空 slice，并新增 handler 回归测试 |
| `ANOM-GOCACHE-001` | 本地环境 | 沙箱不能写 `~/Library/Caches/go-build` | 使用 repo-local `GOCACHE=.cache/go-build` |

## 7. 风险与退出标准

| 风险 | 状态 | 要求 |
|---|---|---|
| Playwright 刷新 | 已关闭 | 当前 E2E 已刷新为 29/29 通过 |
| 管理员导出高并发延迟 | 已量化 | 后台导出是管理操作，不作为公开高频接口；需要生产可加统计快照/缓存 |
| 注册登录高并发延迟 | 已量化 | bcrypt 与 SQLite 写入是瓶颈；生产按限速和容量边界处理 |
| 中国大陆访问 | 方案风险 | 当前使用腾讯云公网 IP 演示；正式域名访问等待 ICP 备案 |
| CI/CD 原状态不足 | 已补齐方向 | 新增 `.github/workflows/ci.yml`，但需推送后看 GitHub Actions 实际结果 |

生产就绪退出标准：

- 全量 Go test/vet/JS check 当前通过。
- Playwright 当前通过或明确列出失败项和处理计划。
- Go stress 目标组合档通过。
- k6 基线脚本通过，重压边界记录清楚。
- Nginx 本地配置和腾讯云公网 HTTP 反代配置都有验证记录；生产 HTTPS 等域名备案和证书完成后补验。
- CI workflow 在远端实际运行通过。
