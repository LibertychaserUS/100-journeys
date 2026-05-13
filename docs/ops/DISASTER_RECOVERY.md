# 灾难恢复与事故预案

**日期**: 2026-05-14  
**目标**: 中型独立站生产场景下，保证 P0 交易可追溯、P1 用户与后台可恢复、P2 体验可降级。

---

## 1. 事故分级

| 等级 | 定义 | 示例 | 目标 |
|---|---|---|---|
| SEV-0 | P0 数据一致性风险 | 支付成功但订单未标记、余额扣减无流水 | 立即停写，保护 DB，人工核账 |
| SEV-1 | 站点核心不可用 | API 5xx 大量出现、SQLite locked 持续 | 30 分钟内恢复核心浏览/登录 |
| SEV-2 | 体验降级 | 图片慢、宠物回复慢、统计延迟 | 降级非核心功能 |
| SEV-3 | 局部异常 | 单张图片 404、单个分析事件丢失 | 例行修复 |

## 2. SQLite 损坏或误删

### 预防

- 开启 WAL。
- 每小时运行在线备份。
- 每日复制备份到异机或对象存储。
- 每次发布前做一次手动备份。

备份命令：

```bash
./scripts/backup-sqlite.sh ./data/app.db ./data/backups
```

### 恢复

1. 停止 Go 服务。
2. 复制当前 DB 到隔离目录，不覆盖。
3. 选择最近一次通过 `PRAGMA integrity_check` 的备份。
4. 替换 `data/app.db`。
5. 启动服务。
6. 进入后台导出订单和交易流水。
7. 对比事故窗口内的 `orders`、`transactions`、`audit_logs`。

### 验证

```bash
sqlite3 ./data/app.db "PRAGMA integrity_check;"
go test ./...
```

## 3. 支付/订单异常

### 触发条件

- paid 订单数量和 purchase 交易数量不一致。
- 用户余额出现负数。
- 同一订单重复支付。
- audit 日志出现支付接口 5xx。

### 处理

1. 暂停支付入口，保留浏览。
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

5. 人工修正必须留下 SQL、操作者、时间和原因。

## 4. 图片/CDN 故障

### 当前风险

本地压测显示 2000 并发图片请求可通过，3000 并发图片请求在 Go 直出场景下会出现连接超时。

### 降级

- 切换到 Nginx/CDN 静态资源。
- 前端保留低分辨率占位。
- 卡片必须先显示文字，不因图片失败空白。
- 临时关闭详情页大图动效。

## 5. 分析 Buffer 过载

### 当前容量

默认 buffer 容量 32768，测试 20000 瞬时事件无丢弃。

### 降级

- 允许丢弃 P2 分析事件。
- 不允许影响订单、支付、注册、登录。
- 管理后台显示“事件统计延迟”提示。
- 若持续过载，降低前端事件采样率。

## 6. 宠物回复或 AI 推荐异常

### 降级

- 返回固定规则推荐。
- 停止写入宠物分析事件。
- 保留搜索、筛选、详情、订单。

## 7. 审计日志膨胀

### 风险

全量 API 请求写入 `audit_logs` 会增加 SQLite 写压力和磁盘增长。

### 处理

- 错误日志和 panic 保持持久化。
- 普通 2xx 请求可按时间窗口归档。
- 每日导出并压缩旧审计日志。
- 保留最近 7 至 30 天在线查询。

归档 SQL 示例：

```sql
CREATE TABLE IF NOT EXISTS audit_logs_archive AS
SELECT * FROM audit_logs WHERE created_at < datetime('now', '-30 days');

DELETE FROM audit_logs WHERE created_at < datetime('now', '-30 days');
VACUUM;
```

## 8. 发布回滚

1. 发布前备份 DB。
2. 发布后检查 `/api/health`。
3. 检查首页、详情页、登录、后台统计。
4. 若出现 SEV-0/SEV-1，恢复上一版本二进制和静态文件。
5. DB schema 变更必须有迁移说明，不允许盲目覆盖。

## 9. 演练频率

- 每次重要提交前：运行 `go test ./...`、`go vet ./...`、JS syntax。
- 每周：执行一次 SQLite 备份恢复演练。
- 每月：执行一次压力测试矩阵。
- 每次上线前：执行一次 P0 订单支付一致性检查。
