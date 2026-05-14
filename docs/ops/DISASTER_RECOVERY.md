# 灾难恢复与事故预案

**日期**: 2026-05-14
**目标**: 在腾讯云 CVM + Nginx + Go Gin + SQLite WAL 的公网演示方案下，保证 P0 交易可追溯、P1 用户与后台可恢复、P2 体验可降级。
**证据口径**: Nginx 与 k6 已完成本地验证，重压边界记录在 `docs/ops/LOAD_TEST_RESULTS.md`；腾讯云公网 IP 已完成首页、健康检查、普通用户登录和管理员登录 smoke。

---

## 1. 事故分级

| 等级 | 定义 | 示例 | 目标 |
|---|---|---|---|
| SEV-0 | P0 数据一致性风险 | 支付成功但订单未标记、余额扣减无流水、同一订单重复扣款 | 立即停写，保护 DB，人工核账 |
| SEV-1 | 核心站点不可用 | `/api/health` 失败、API 5xx 大量出现、SQLite locked 持续 | 30 分钟内恢复浏览/登录/订单核心链路 |
| SEV-2 | 体验降级 | 图片慢、Nginx 缓存未命中、宠物回复慢、统计延迟 | 降级非核心功能，保护 P0/P1 |
| SEV-3 | 局部异常 | 单张图片 404、单个分析事件丢失、单个页面样式异常 | 例行修复并补日志 |

## 2. 真实部署依赖

生产恢复预案必须围绕真实代码和文件：

- Go 服务入口：`cmd/server/main.go`。
- SQLite 初始化：`internal/repository/db.go`，WAL、busy timeout、单连接写入边界。
- DDL：`db/schema.sql`。
- 在线备份：`scripts/backup-sqlite.sh`。
- Nginx 模板：`deploy/nginx.conf`。
- 本地 Nginx 验证：`deploy/nginx.local.conf`，由 `scripts/nginx/render-local-config.sh` 生成并已通过语法检查。
- k6 脚本：`tests/load/*.k6.js`。
- 媒体策略：本地 `/static/assets/images` 优先，`CDN_BASE_URL` 只作为本地缺失媒体的服务器侧 fallback。

## 3. SQLite 损坏、误删或磁盘故障

### 预防

- SQLite 必须运行在持久化磁盘，不能放在临时目录。
- WAL 已由代码和 schema 启用，但上线后仍需检查实际 DB 文件。
- 每小时或按业务频率运行在线备份。
- 每日复制备份到异机、对象存储或另一块持久化盘。
- 每次发布前做一次手动备份。
- 腾讯云 CVM 需要磁盘空间告警；SQLite、WAL、备份文件不能把磁盘写满。

备份命令：

```bash
./scripts/backup-sqlite.sh ./data/app.db ./data/backups
```

该脚本会：

- 检查 `sqlite3` 是否存在。
- 使用 `.backup` 生成在线备份。
- 对备份文件执行 `PRAGMA integrity_check;`。
- 输出生成的备份文件路径。

### 恢复

1. 将 Nginx 写入入口切到维护页，至少暂停登录、订单、支付等写操作。
2. 停止 Go 服务。
3. 复制当前 `app.db`、`app.db-wal`、`app.db-shm` 到隔离目录，不覆盖原始证据。
4. 选择最近一次通过 `PRAGMA integrity_check;` 的备份。
5. 替换 `data/app.db`。
6. 启动 Go 服务。
7. 检查 `/api/health`。
8. 进入后台导出订单和交易流水。
9. 对比事故窗口内的 `orders`、`transactions`、`audit_logs`。

### 验证

```bash
sqlite3 ./data/app.db "PRAGMA integrity_check;"
go test ./...
```

恢复证据占位：

| 项目 | 当前状态 | 待填写 |
|---|---|---|
| 最近可用备份路径 | 待恢复演练 | 演练时记录备份文件名、大小、UTC 时间 |
| integrity_check | 待恢复演练 | 演练时记录 exact output |
| 恢复后 `/api/health` | 待恢复演练 | 演练时记录 HTTP 状态与响应体 |
| 订单/流水核对 | 待恢复演练 | 演练时记录 paid 订单数、purchase 流水数、差异 |

## 4. 支付/订单异常

### 触发条件

- paid 订单数量和 purchase 交易数量不一致。
- 用户余额出现负数。
- 同一订单重复支付。
- `audit_logs` 中支付接口出现 5xx。
- k6 `tests/load/order-payment-audit.k6.js` 暴露订单、充值、支付、流水校验失败。

### 处理

1. 暂停支付入口，保留只读浏览。
2. 备份 DB。
3. 导出订单和交易流水：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://example.com/api/admin/export?format=csv" \
  -o admin-export.csv
```

4. 运行一致性 SQL：

```sql
SELECT COUNT(*) FROM orders WHERE status='paid';
SELECT COUNT(*) FROM transactions WHERE txn_type='purchase';
SELECT id, balance FROM users WHERE balance < 0;
SELECT order_id, COUNT(*) FROM transactions
 WHERE txn_type='purchase'
 GROUP BY order_id HAVING COUNT(*) > 1;
```

5. 人工修正必须留下 SQL、操作者、时间、原因和修正前备份路径。
6. 恢复支付入口前重新执行订单/支付 k6 小流量回归。

## 5. Nginx、CDN 与静态图片故障

### 当前风险

本地 Go stress 记录显示：2000 并发图片请求可通过，3000 并发图片请求在 Go 直出场景下出现连接超时。这个结果说明 Go 静态直出不能作为生产图片承载方案。

生产目标：

- `/api/` 由 Nginx 反向代理到 Go。
- `/static/` 当前由 Nginx 承载，后续可迁移或缓存到 CDN/对象存储。
- 生成 JPG、详情大图、头像等高流量媒体后续可迁移到 COS/OSS/R2/CDN 源站。
- 本地静态资源仍应保持可用，并由 Nginx/CDN 缓存；`CDN_BASE_URL` 只处理本地缺失媒体的 fallback，不改变前端 `mediaBase`。

### 故障处理

- 如果 CDN/WAF 误拦截 API：临时放宽对应规则，保留限速和日志。
- 如果对象存储/CDN 图片异常：切回 Nginx 本机 `/static/` 或低分辨率占位。
- 如果 Nginx 反代失败：检查 upstream `127.0.0.1:8080`、Go 进程、端口、防火墙、错误日志。
- 如果 Nginx 静态路径 404：检查 `alias/root` 是否为生产绝对路径，不能使用未替换的示例路径。
- 如果大陆访问慢：记录为网络、备案、供应商或链路限制，不承诺当前公网 IP 演示等于正式优化线路。

### 证据占位

| 证据项 | 命令或文件 | 当前状态 | 待填写结果 |
|---|---|---|---|
| Nginx 语法 | `nginx -t -c deploy/nginx.local.conf -p .nginx` | 已验证 | `test is successful` |
| API 反代 | `curl -i http://127.0.0.1:18080/api/health` | 已验证 | `{"data":{"status":"ok"},"error":null}` |
| 静态图片响应头 | `curl -I http://127.0.0.1:18080/static/assets/images/generated/hero-taoyuan.jpg` | 已验证 | `200 OK`，`Content-Length: 451823`，有 `Cache-Control` |
| 腾讯云公网 IP | `curl http://49.232.207.220/` | 已验证 | `200 OK` |
| 域名/HTTPS | 备案后配置 | 待备案 | 备案后记录域名、证书、HTTPS 状态 |
| 对象存储/CDN 图片 | `CDN_BASE_URL` + 图片 URL | 可选后续 | 接入后记录 URL、缓存头、失败率 |

## 6. 中国大陆访问异常

必须按以下口径处理：

- 当前腾讯云公网 IP 可以外部访问，但正式域名需要 ICP 备案。
- 若业务必须保证中国大陆性能，通常需要 ICP/备案、中国大陆 CDN/网络供应商或更完整的云安全组/监控配置。
- 没有备案时，不应把任意中国大陆云服务器 + 未备案域名作为正式域名交付方案。
- 事故报告中不要把大陆访问慢写成应用代码缺陷，除非 API、Nginx 或 DB 指标同时异常。

排查顺序：

1. 检查腾讯云 CVM 是否正常。
2. 检查 Nginx `/api/health` 和静态图片本地响应。
3. 检查腾讯云安全组、firewalld、Nginx、systemd 状态是否异常。
4. 分区域记录延迟和失败率。
5. 将大陆链路问题标记为网络/合规/供应商待办，而不是承诺已解决。

## 7. 分析 Buffer 过载

### 当前容量

当前记录显示默认 buffer 容量已提升到 32768，`STRESS_ANALYTICS_EVENTS=20000` 的本地 stress 通过。但 k6 准生产证据尚未填写。

### 降级

- 允许丢弃 P2 分析事件。
- 不允许影响订单、支付、注册、登录。
- 管理后台显示“事件统计延迟”提示。
- 若持续过载，降低前端事件采样率。

对应 k6：

- `tests/load/admin-analytics-export.k6.js`
- `tests/load/pet-chat-analytics.k6.js`

## 8. 宠物回复或 AI 推荐异常

### 降级

- 返回固定规则推荐。
- 停止写入宠物分析事件或降低采样率。
- 保留搜索、筛选、详情、订单。
- 记录 `audit_logs` 与前端错误上报，避免静默失败。

对应 k6：

- `tests/load/pet-chat-analytics.k6.js`

## 9. 审计日志膨胀

### 风险

全量 API 请求写入 `audit_logs` 会增加 SQLite 写压力和磁盘增长。

### 处理

- 错误日志和 panic 保持持久化。
- 普通 2xx 请求可按时间窗口归档。
- 每日导出并压缩旧审计日志。
- 保留最近 7 至 30 天在线查询。
- 归档前先备份 DB。

归档 SQL 示例：

```sql
CREATE TABLE IF NOT EXISTS audit_logs_archive AS
SELECT * FROM audit_logs WHERE created_at < datetime('now', '-30 days');

DELETE FROM audit_logs WHERE created_at < datetime('now', '-30 days');
VACUUM;
```

## 10. 发布回滚

1. 发布前运行 `scripts/backup-sqlite.sh`。
2. 发布前记录当前 Go 二进制、静态文件、Nginx 配置版本。
3. 发布后检查 `/api/health`。
4. 检查首页、详情页、登录、后台统计、订单支付。
5. 若出现 SEV-0/SEV-1，恢复上一版本二进制和静态文件。
6. DB schema 变更必须有迁移说明，不允许盲目覆盖。
7. Nginx 配置变更必须先 `nginx -t`，再 reload。
8. 云安全组、Nginx、CDN/WAF 规则变更必须记录规则 ID、操作者和回滚方式。

## 11. 演练频率

- 每次重要提交前：运行 `go test ./...`、`go vet ./...`、JS syntax。
- 每次上线前：运行 `scripts/backup-sqlite.sh` 并保存备份路径。
- 每周：执行一次 SQLite 备份恢复演练。
- 每月：执行一次 k6 压力测试矩阵。
- 每次 Nginx 配置调整：执行 `nginx -t` 和 `/api/health` 验证。
- 每次云安全组、DNS、TLS、WAF/CDN 规则调整：记录变更和回滚步骤。

## 12. k6 事故复盘证据表

本轮 k6 结果详见 `docs/ops/LOAD_TEST_RESULTS.md`。事故/演练复盘时至少记录：

| 脚本 | 覆盖面 | 本轮基线 |
|---|---|---|
| `tests/load/public-content-flow.k6.js` | 公共浏览、搜索、筛选、详情 API | 200 VU / 30s 通过，p95 61.21 ms |
| `tests/load/auth-register-login.k6.js` | 注册、验证码、登录 | 40 VU / 30s 通过；120 VU / 30s 延迟阈值失败 |
| `tests/load/order-payment-audit.k6.js` | 订单、充值、支付、流水核对 | 80 VU / 30s 通过，P0 一致性成立 |
| `tests/load/admin-analytics-export.k6.js` | 分析写入、后台统计、CSV 导出 | 10 VU / 30s 通过；60 VU / 30s 延迟阈值失败 |
| `tests/load/pet-chat-analytics.k6.js` | 宠物回复、分析 buffer | 200 VU / 30s 通过，p95 8.87 ms |
| `tests/load/image-static-cache.k6.js` | 静态图片吞吐、缓存头、资源大小 | 300 VU / 30s 通过，Nginx 静态路径有效 |
