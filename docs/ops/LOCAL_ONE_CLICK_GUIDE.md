# 本地一键部署傻瓜式 Guide

> 目标：不登录服务器，也不手工找端口，一条命令在本机跑起完整 Web + Go API + SQLite 数据库 + 演示用户数据。

## 1. 一条命令启动

在仓库根目录执行：

```bash
scripts/deploy/local-one-click.sh
```

脚本会自动完成：

1. 检查 Go 和 Python3。
2. 如果上一次本地一键进程还在，先停止。
3. 检查 `18080/18081` 是否可用。
4. 如果端口被占用，自动顺延寻找空闲端口。
5. 初始化 SQLite 数据库。
6. 导入 `db/schema.sql` 和 `db/seed.sql`。
7. 生成 50 个普通用户和 3 个管理员。
8. 生成头像、订单、交易流水、积分、收藏、analytics、audit 样本。
9. 启动 Go 服务。
10. 如果本机装了 Nginx，则启动本地 Nginx 反代；没有 Nginx 时自动回退到 Go 直出。
11. curl 检查 `/api/health` 和 `/api/journeys?limit=3`。
12. 打印最终 URL、Go API 端口、SQLite 路径和演示账号。

## 2. 启动后访问

脚本输出示例：

```text
Local full-stack deployment is running.

URL: http://127.0.0.1:18080/
Go API: http://127.0.0.1:18081/
SQLite DB: /path/to/100-journeys/data/local-one-click.db
Stop: scripts/deploy/local-one-click.sh --stop
```

打开脚本打印的 `URL` 即可，不要假设端口一定是 `18080`，因为被占用时会自动换端口。

## 3. 演示账号

| 类型 | 入口 | 账号 |
|---|---|---|
| 普通用户 | `#/login` | `user@100journeys.demo` / `TaoyuanUser12345` |
| 管理员 | `#/admin-login` | `admin@100journeys.demo` / `TaoyuanAdmin12345` |

另外还会生成：

- `demo-virtual-01@example.com` 到 `demo-virtual-49@example.com`
- `demo-admin-01@example.com` 到 `demo-admin-02@example.com`

密码与上表相同。所有密码都以 bcrypt hash 写入数据库。

## 4. 停止本地全栈

```bash
scripts/deploy/local-one-click.sh --stop
```

停止后可以确认端口无残留：

```bash
lsof -nP -iTCP:18080-18390 -sTCP:LISTEN
```

如果没有输出，说明本项目本地验收端口没有残留监听。

## 5. 只初始化数据库

```bash
scripts/deploy/init-demo-data.sh ./data/demo.db
```

它会写入：

- 12 条高质量旅程 seed。
- 50 个普通用户。
- 3 个管理员。
- 本地 GitHub-style 默认头像。
- paid orders、transactions、points history、saved journeys。
- analytics events 和 audit logs。

## 6. 端口被占用怎么办

无需手动处理。脚本会自动检查端口：

- 首选浏览器端口：`18080`
- 首选 Go API 端口：`18081`
- 被占用时：自动尝试下一个端口，最多递增 5 次。

超过 5 次仍失败时，脚本会报错退出，并打印现实原因：通常是端口已被其他本地服务占用，或上一次 Go/Nginx 进程还在关闭中。

也可以手动指定首选端口：

```bash
scripts/deploy/local-one-click.sh --public-port 19080 --api-port 19081
```

如果 5 次自动递增仍失败：

```bash
scripts/deploy/local-one-click.sh --stop
lsof -nP -iTCP:18080-18084 -sTCP:LISTEN
lsof -nP -iTCP:18081-18085 -sTCP:LISTEN
```

然后换一组更高的端口：

```bash
scripts/deploy/local-one-click.sh --public-port 19080 --api-port 19081
```

## 7. k6 不要重复下载

k6 是压测工具，只需要安装一次：

```bash
command -v k6 || brew install k6
```

已安装后直接运行脚本即可：

```bash
BASE_URL=http://127.0.0.1:18080 VUS=200 DURATION=30s k6 run tests/load/public-content-flow.k6.js
```

公网 IP 已启用 Nginx 单 IP 限流，所以公网 k6 只做小流量 smoke；容量压测以本地 Nginx 和 Go stress matrix 为准。

## 8. 没有 GORM 是否影响注册

不影响。本项目有意不使用 GORM。

注册写入链路：

```text
前端注册表单
  -> POST /api/auth/register
  -> AuthHandler.Register 校验验证码、用户名、密码、邮箱
  -> bcrypt.GenerateFromPassword
  -> UserRepository.Create
  -> 参数化 INSERT INTO users
  -> AddPoints 写入注册积分历史
  -> 返回 JWT
```

SQLite 写入由 `database/sql` + `modernc.org/sqlite` + repository 层完成。`repository.NewDB` 开启 WAL、foreign keys、busy timeout，并限制单连接写边界。

## 9. Buffer 怎么工作

P0/P1 核心数据不走 buffer：

- 注册用户
- 钱包充值
- 下单
- 支付
- 交易流水
- 积分历史

这些都同步写 SQLite，并在订单/支付链路使用事务。

Buffer 只服务 P2 行为事件：

- 点击旅程
- 搜索
- 筛选
- 宠物回复

`analytics.Buffer` 默认容量 `32768`，后台按 batch 写入 `analytics_events`。如果瞬时流量超过容量，可以丢弃 P2 analytics，但不能阻塞或破坏注册、下单、支付。
