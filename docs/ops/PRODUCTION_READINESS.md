# 生产就绪说明：腾讯云 CVM + Nginx

**日期**: 2026-05-14
**适用范围**: 课程/作业提交、个人作品站、小型到中型独立内容站。
**部署目标**: 腾讯云 CVM 公网 IP 演示 + Nginx 反向代理 + Go Gin API + SQLite WAL。正式域名与 HTTPS 在 ICP 备案完成后配置。
**不适用范围**: 大规模电商、金融级交易、跨区域强一致系统。

---

## 1. 生产目标口径

本项目的“生产可用”只在以下边界内成立：

- P0 订单、钱包、交易流水不丢、不重复、可审计。
- P1 注册登录、后台统计、运行日志可追踪、可恢复。
- P2 浏览事件、宠物回复、点击统计允许降级，但不能拖垮核心链路。
- SQLite 作为单机中型独立站数据库使用，启用 WAL、单写边界和在线备份。
- 生产流量中的静态图片不应由 Go Gin 进程长期直出，应由 Nginx、CDN 或对象存储承担。

当前代码事实：

- `cmd/server/main.go` 读取 `PORT`、`DB_PATH`、`UPLOAD_DIR`、`CDN_BASE_URL`。
- 图片基址默认固定为 `/static/assets/images`，服务端媒体解析采用本地优先；只有本地缺失且设置 `CDN_BASE_URL` 时才返回 CDN/R2 fallback。
- `internal/repository/db.go` 使用 `modernc.org/sqlite`，开启 `foreign_keys(1)`、`journal_mode(WAL)`、`busy_timeout(5000)`，并将 `MaxOpenConns` 设为 1。
- `db/schema.sql` 包含 `PRAGMA journal_mode=WAL;`。
- `web/js/config.js` 和服务端注入的 `window.APP_CONFIG` 负责前端 API 与媒体基址切换。
- `scripts/backup-sqlite.sh` 使用 sqlite3 `.backup` 做在线备份并执行 `PRAGMA integrity_check;`。

## 2. 当前生产演示拓扑

```text
用户浏览器
-> Tencent Cloud CVM public IP: 49.232.207.220
-> Nginx reverse proxy
   -> /static/ 静态文件缓存
   -> /api/ 127.0.0.1:8080 Go Gin API
-> SQLite WAL 数据库
-> scripts/backup-sqlite.sh 定时备份
-> 异机磁盘或对象存储归档
```

关键约束：

- API 与图片分层。图片优先走 Nginx 静态缓存，后续可迁移到 CDN/对象存储；API 走 Gin。
- 腾讯云 CVM 负责 Go 进程、Nginx、SQLite 数据目录、上传目录和系统服务守护。
- SQLite 数据目录必须放在持久化磁盘上，不能放在临时目录或容器临时层。
- 备份不能只留在同机同目录，必须复制到异机、对象存储或至少另一块持久化盘。
- `deploy/nginx.conf` 是腾讯云当前 HTTP 反代模板；备案和域名证书完成后再补 443 server block。`deploy/nginx.local.conf` 是本地压测配置，由 `scripts/nginx/render-local-config.sh` 生成。

## 3. HTTPS 与备案口径

本地压测使用 `http://127.0.0.1:18080`，目的是隔离验证 Nginx 反代、静态缓存和 API 性能，不把自签证书问题混入应用压测。

正式域名生产必须使用 HTTPS：

- 当前作业演示使用 `http://49.232.207.220/`，因为域名备案尚未完成。
- 备案完成后，域名解析到腾讯云 CVM 或 CDN/Edge 入口。
- Nginx 安装 Let's Encrypt 或腾讯云/其他 CA 证书，并将 80 重定向到 443。
- 本地 `deploy/nginx.local.conf` 不是生产配置，不代表正式域名可以使用明文 HTTP。

## 4. 腾讯云、备案与中国大陆访问口径

当前事实：

- 腾讯云 CVM 已完成公网 IP 演示，Nginx 监听 80，Go 服务绑定 `127.0.0.1:8080`。
- 服务器 firewalld 已收紧，SSH 使用密钥并按管理 IP 白名单开放。
- 未备案域名不能直接解析到中国大陆服务器作为正式域名服务。
- 域名备案通过后再补 HTTPS、域名访问截图、证书状态和安全组截图。

必须诚实说明：

- 当前可以表述为“可外部登录的腾讯云公网 IP 演示”。
- 当前不能表述为“正式备案域名生产上线”。
- 当前不能表述为“已完成 HTTPS 正式生产域名”。
- 若未来要承诺中国大陆优化访问，需要 ICP/备案、合规域名主体和国内 CDN/网络服务。

参考依据：

- 腾讯云备案文档说明，中国大陆服务器绑定域名提供网站服务前需要完成备案。
- 腾讯云域名访问规则说明，未备案域名解析到中国大陆服务器会被拦截。

## 5. Nginx 与静态资源策略

当前代码仍可由 Gin 暴露 `/static/` 和 `/uploads/`，这是本地开发与演示路径，不是生产图片承载目标。

生产建议：

- `/api/` 由 Nginx 反代到 `127.0.0.1:8080` 的 Go Gin 服务。
- `/static/` 由 Nginx 直接服务本机 `web/` 目录，后续可由 CDN 缓存。
- 生成图片、详情页大图、头像等高流量媒体后续可迁移到 COS/OSS/R2/CDN 源站。
- 公开图片优先保持本地路径可用，再由 Nginx/CDN 缓存。`CDN_BASE_URL` 用于本地缺失图片的服务器侧 fallback；若要全量迁移到 CDN，应保持同名对象路径或调整服务端媒体 provider，而不是让前端散落改 URL。
- 对 `/api/auth/` 使用更严格限速，对 `/api/` 使用基础限速，参考 `deploy/nginx.conf`。当前腾讯云公网入口命中限流时返回 `429`，这是入口保护，不是 Go API 崩溃。

本轮已验证：

- `deploy/nginx.local.conf` 由 `scripts/nginx/render-local-config.sh 18080 18081` 生成。
- `nginx -t -c deploy/nginx.local.conf -p .nginx` 通过。
- 腾讯云 `/etc/nginx/conf.d/100-journeys.conf` 已与仓库 `deploy/nginx.conf` 对齐，并通过 `nginx -t`、`systemctl reload nginx`。
- `/api/health` 经 Nginx 反代返回 `{"data":{"status":"ok"},"error":null}`。
- `/static/css/tokens.css` 经 Nginx 返回 `Content-Type: text/css`。
- `/static/js/router.js` 经 Nginx 返回 `Content-Type: application/javascript`。
- `/static/assets/images/generated/hero-taoyuan.jpg` 经 Nginx 返回 `200 OK`、`Content-Type: image/jpeg`、`Content-Length: 451823`、`Cache-Control`。
- `/static/assets/images/avatars/github-default/avatar-00.svg` 经 Nginx 返回 `Content-Type: image/svg+xml`。
- 初版 Nginx 模板漏掉 `/static/css/`、`/static/js/`、`/static/assets/`，本轮已修正生产模板和本地生成器。

### 5.0 数据库访问层说明

本项目没有使用 GORM。数据库写入由 `database/sql` + `modernc.org/sqlite` + repository 层完成：

- `repository.NewDB` 开启 WAL、foreign keys、busy timeout，并限制 SQLite 单连接写入边界。
- 注册用户由 `AuthHandler.Register` 完成校验和 bcrypt hash，再调用 `UserRepository.Create` 执行参数化 `INSERT INTO users`。
- 钱包充值、订单支付、积分变更和交易流水属于 P0/P1，必须同步事务落库。
- `analytics.Buffer` 只承接 P2 行为事件，默认容量 `32768`，后台 batch 写入 `analytics_events`；满载丢弃 P2 事件，不影响核心业务。

### 5.1 Demo 数据与后台验收

`cmd/demo-data` 可生成可复现的演示数据：

```bash
scripts/deploy/init-demo-data.sh ./data/demo.db
```

数据口径：

- 50 个普通用户和 3 个管理员。
- 普通用户包含用户名、邮箱、bcrypt 密码哈希、必填 gender、本地 GitHub-style 默认头像、钱包、积分、订单、流水、收藏、analytics 行为。
- 部分用户可不透露 MBTI，符合“未测试/未填写可为空”的产品口径。
- 头像、订单、流水和个人资料绑定服务端账户身份；前端个人页只展示用户名、邮箱、头像、钱包、积分、订单与流水，不展示内部数据库 ID。
- 管理后台可看到用户数、订单数、收入、点击/购买、MBTI、性别、审计错误与导出结果。

### 5.2 本地一键部署

本地验收入口：

```bash
scripts/deploy/local-one-click.sh
```

脚本自动选择空闲端口，默认初始化 `./data/local-one-click.db`，创建 50 个普通用户与 3 个管理员，并打印最终访问 URL。端口递增最多尝试 5 次，超过后报错说明占用原因和处理命令。停止命令：

```bash
scripts/deploy/local-one-click.sh --stop
```

详细步骤：`docs/ops/LOCAL_ONE_CLICK_GUIDE.md`。

## 6. 当前压测证据

已知本地 Go stress 证据：

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

本轮记录结果：

```text
ok github.com/100-journeys/app/tests/stress 1.660s
```

上一会话历史记录：

```text
ok github.com/100-journeys/app/tests/stress 15.271s
```

失败/边界：

- `STRESS_IMAGE_REQUESTS=3000` 在本地 `httptest` 静态图片直出场景下出现连接超时。
- 结论：不能把 Go 直出静态图片作为生产结论；生产图片必须前置 Nginx/CDN/R2。

本轮 k6 证据详见 `docs/ops/LOAD_TEST_RESULTS.md`。摘要：

| 证据项 | 档位 | 结果 |
|---|---:|---|
| 公共浏览 | 200 VU / 30s | 39193 请求，失败率 0，p95 61.21 ms |
| Nginx 静态图片 | 300 VU / 30s | 9000 请求，失败率 0，p95 17.92 ms |
| 宠物与分析 | 200 VU / 30s | 12000 请求，失败率 0，p95 8.87 ms |
| 订单支付审计 | 80 VU / 30s | 10240 请求，失败率 0，p95 574.66 ms |
| 注册登录基线 | 40 VU / 30s | 2964 请求，失败率 0，p95 437.77 ms |
| 注册登录重压 | 120 VU / 30s | 功能 100% 通过，p95 约 2s，阈值失败 |
| 后台导出基线 | 10 VU / 30s | 852 请求，失败率 0，p95 94.61 ms |
| 后台导出重压 | 60 VU / 30s | 功能 100% 通过，p95 598.95 ms，阈值失败 |
| 腾讯云公网 smoke | 1 VU / 10s | 49 请求，失败率 0，p95 105.89 ms |
| 腾讯云公网限流验证 | 10 VU / 10s | 触发单 IP 限流，按 Nginx 入口保护处理 |

## 7. 腾讯云上线检查清单

本节描述的是“生产可用架构与演示部署进度”，不是已经完成全部正式生产上线。未勾选项必须在正式域名、证书和长期运维策略固定后由部署负责人补齐；当前提交可按公网演示和中型独立站 MVP 容量边界交付。

- [x] 创建腾讯云 CVM，公网 IP 为 `49.232.207.220`。
- [x] Go 二进制、`web/`、`db/schema.sql`、`db/seed.sql` 部署到 `/opt/100-journeys/app`。
- [x] 设置 `PORT=8080`、`BIND_ADDR=127.0.0.1:8080`、`DB_PATH`、`UPLOAD_DIR`、`JWT_SECRET`。
- [x] `JWT_SECRET` 使用服务器本地随机值，保存于 `/etc/100-journeys/100-journeys.env`，权限 `600`。
- [x] SQLite 数据目录在 `/var/lib/100-journeys`。
- [x] Go 服务由 `100-journeys.service` 守护，`Restart=always`。
- [x] Nginx 反代 `/api/`，静态文件由 Nginx 承担。
- [x] SSH 禁用密码登录，仅允许密钥；firewalld 开放 HTTP 和管理 IP 白名单 SSH。
- [ ] `deploy/systemd/100-journeys-backup.timer` 已启用，定时调用 `scripts/backup-sqlite.sh`。
- [ ] `deploy/systemd/100-journeys-stack.target` 能同时拉起 API、Nginx 和备份 timer。
- [x] 本地一键部署脚本 `scripts/deploy/local-one-click.sh` 已完成 SQLite 初始化、演示数据生成、自动换端口和停机验证。
- [ ] 生产 systemd 安装脚本如需交付，可在正式域名/证书/服务器策略固定后从当前 Nginx 模板补齐。
- [ ] 备份文件复制到异机、对象存储或另一块持久化盘。
- [ ] 至少完成一次恢复演练。
- [ ] 域名备案完成后配置 HTTPS 并截图/记录。
- [ ] k6 六个脚本在准生产或生产等价环境执行并记录结果。
- [x] Playwright E2E 全量通过并记录日期：2026-05-14，`29 passed`。
- [ ] 管理员账号不使用默认密码，且只通过服务器侧 CLI 创建或提升。
- [ ] 日志目录、DB 目录、备份目录有磁盘空间告警。

未完成项归属与时限：域名备案/HTTPS、异机备份、恢复演练、磁盘空间告警和生产默认密码轮换属于正式上线前运维任务；在域名与证书确定后的同一部署窗口完成。k6 六脚本已在本地 Nginx 等价入口完成基线与回归，正式域名切换后需重新记录生产入口证据。

当前演示地址：`http://49.232.207.220/`。隐藏后台入口：`http://49.232.207.220/#/admin-login`。域名备案完成后再切换为正式 HTTPS 域名。

## 8. P0 交易策略

当前 P0 订单路径：

```text
Create order -> order_items -> Pay transaction -> user balance -> transactions ledger
```

要求：

- 不进入可丢 buffer。
- 不依赖进程内 event bus 完成一致性。
- 任何失败必须回滚。
- 支付完成后才发布异步事件。
- 后台导出必须能追踪订单、用户、金额、交易流水。
- 高并发写入受 SQLite 单写模型限制；若订单量继续增长，应迁移到服务端数据库或增加持久化 outbox/job worker。

## 9. P1/P2 降级策略

P1：

- 注册登录：密码 bcrypt 哈希。
- 日志审计：API 请求、错误、panic、前端错误进入 `audit_logs`。
- 后台统计：从 `users/orders/order_items/transactions/analytics_events/audit_logs` 聚合。
- 导出：`/api/admin/export?format=csv|json`。
- 备份：使用 `scripts/backup-sqlite.sh` 做在线 SQLite backup。

P2：

- 分析 buffer 满：拒收或丢弃 P2 事件，保护 P0/P1。
- 宠物回复慢：返回降级文案，不阻塞浏览和支付。
- 图片慢：走 Nginx/CDN/R2 缓存、低分辨率占位。
- Dashboard 慢：降低刷新频率或只展示核心指标。

## 10. CI/CD 与 DevOps 口径

原仓库只有 `.github/workflows/pages.yml`，它只能把 `web/` 发布到 GitHub Pages，不验证 Go 后端、SQLite、Nginx、k6 或文档生成一致性，因此不能称为完整全栈 CI/CD。

本轮新增 `.github/workflows/ci.yml`：

- `go test ./...`
- `go vet ./...`
- JS syntax check
- `python3 scripts/docs/generate_project_artifacts.py`
- 生成文档 diff 检查
- Nginx 本地配置生成和 `nginx -t`
- Go stress smoke
- Go server + Nginx + k6 smoke

注意：CI 只有推送到 GitHub 后才能获得远端真实绿色结果；本地创建 workflow 不等于远端 CI 已通过。

## 11. 结论

在腾讯云 CVM、Nginx 静态与反代、SQLite WAL、外部登录验证、本地 Nginx/k6 基线证据和恢复预案说明完成后，本项目可以按“中型独立站 MVP，具备可运行公网演示和明确容量边界”口径提交。它不是全部正式生产运维项均已闭环的生产系统；正式域名、HTTPS、异机备份、恢复演练、磁盘告警和默认演示账号轮换仍需在上线部署窗口补齐。

如果仍坚持单进程 Gin 同时承载 API、SQLite 写入和所有大图直出，则不能给出生产满意结论。
