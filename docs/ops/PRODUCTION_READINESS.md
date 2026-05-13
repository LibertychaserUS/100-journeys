# 中型独立站生产就绪说明

**日期**: 2026-05-14  
**适用范围**: 课程/作业提交、个人作品站、小型到中型独立内容站。  
**不适用范围**: 大规模电商、金融级交易、跨区域强一致系统。

---

## 1. 生产目标口径

本项目的“生产可用”定义为：

- P0 订单、钱包、交易流水不丢、不重复、可审计。
- P1 注册登录、后台统计、运行日志可追踪、可恢复。
- P2 浏览事件、宠物回复、点击统计允许降级，但不能拖垮核心链路。
- 静态资源不由 Go API 长期承载，应迁到 Nginx/CDN。
- SQLite 仅作为中型独立站单机数据库使用，必须有备份和恢复演练。

## 2. 推荐生产拓扑

```text
User
-> CDN/Nginx static cache
-> Nginx reverse proxy
-> Go Gin API
-> SQLite WAL database
-> backup job
```

关键约束：

- API 与图片分层。图片走 CDN/Nginx，API 走 Gin。
- SQLite 使用 WAL，P0 写入通过事务和单写边界控制。
- 审计日志可写 SQLite，但高并发阶段应批量化或转日志文件。
- 定时备份必须落到另一块磁盘或对象存储，不应只放在同机同目录。

## 3. 当前压测证据

通过：

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

单项通过：

- `STRESS_ANALYTICS_EVENTS=20000`: buffer 无丢弃。
- `STRESS_ORDERS=500`: 订单、支付、交易流水一致。
- `STRESS_PUBLIC_REQUESTS=3000`: 公共 API 浏览通过。
- `STRESS_ADMIN_REQUESTS=300`: 后台统计通过。
- `STRESS_IMAGE_REQUESTS=2000`: 本地图片直出通过。

失败边界：

- `STRESS_IMAGE_REQUESTS=3000` 在本地 `httptest` 静态图片直出场景下出现 `connect: operation timed out`。
- 结论：中型独立站生产应将图片迁出 Go 进程，使用 Nginx/CDN。

## 4. P0 交易策略

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

## 5. P1 运维策略

- 注册登录：密码 bcrypt 哈希；用户名可重复；用户唯一 ID 不可重复。
- 日志审计：API 请求、错误、panic、前端错误进入 `audit_logs`。
- 后台统计：从 `users/orders/order_items/transactions/analytics_events/audit_logs` 聚合。
- 导出：`/api/admin/export?format=csv|json`。
- 管理员账号：只能通过服务器侧 CLI 创建或提升，不提供公开注册入口。
- 备份：使用 `scripts/backup-sqlite.sh` 做在线 SQLite backup。

管理员创建示例：

```bash
ADMIN_PASSWORD='replace-with-a-long-secret' \
go run ./cmd/admin-user \
  -db ./data/app.db \
  -email admin@example.com \
  -username admin
```

## 6. P2 降级策略

- 分析 buffer 满：拒收 P2 事件，保护 P0/P1。
- 宠物回复慢：返回降级文案，不阻塞浏览和支付。
- 图片慢：走缓存、低分辨率占位、CDN/Nginx。
- Dashboard 慢：降低刷新频率或只展示核心指标。

## 7. 上线前检查清单

- [ ] `JWT_SECRET` 使用强随机值，不能使用默认开发值。
- [ ] Nginx/CDN 接管 `/static/assets/images/`。
- [ ] SQLite 数据目录在持久化磁盘。
- [ ] `scripts/backup-sqlite.sh` 已加入定时任务。
- [ ] 备份文件已复制到异机或对象存储。
- [ ] 恢复演练完成。
- [ ] k6 在准生产环境跑过至少 5 个脚本。
- [ ] Playwright E2E 全量通过并记录日期。
- [ ] 管理员账号不使用默认密码。
- [ ] 日志目录和 DB 目录有磁盘空间告警。

## 8. 满意度判断

在上述拓扑和检查清单完成后，本项目可以达到“中型独立站实际生产可用”的满意标准。

如果仍坚持单进程 Gin 同时承载 API、SQLite 写入和所有大图直出，则不能给出生产满意结论。
