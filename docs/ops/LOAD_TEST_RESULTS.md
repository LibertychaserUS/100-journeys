# 负载测试与 Nginx 验证结果

**日期**: 2026-05-14
**本地入口**: `http://127.0.0.1:18080` -> 本地 Nginx -> `127.0.0.1:18081` Go Gin
**公网入口**: `http://49.232.207.220` -> 腾讯云 Nginx -> `127.0.0.1:8080` Go Gin
**本地数据库**: `./data/nginx-k6.db`
**用途**: 记录本轮真实执行结果；不把失败阈值改写成通过。

---

## 1. Nginx 验证

| 项目 | 结果 |
|---|---|
| 安装版本 | `/opt/homebrew/bin/nginx`, `nginx/1.29.8` |
| 配置生成 | `scripts/nginx/render-local-config.sh 18080 18081` |
| 语法检查 | 本地与腾讯云 `/etc/nginx/conf.d/100-journeys.conf` 均通过 `nginx -t` |
| API 反代 | `curl http://127.0.0.1:18080/api/health` 返回 `{"data":{"status":"ok"},"error":null}` |
| 静态 CSS | `/static/css/tokens.css` 返回 `Content-Type: text/css` |
| 静态 JS | `/static/js/router.js` 返回 `Content-Type: application/javascript` |
| 静态图片 | `/static/assets/images/generated/hero-taoyuan.jpg` 返回 `HTTP/1.1 200 OK` |
| 默认头像 | `/static/assets/images/avatars/github-default/avatar-00.svg` 返回 `Content-Type: image/svg+xml` |
| 图片响应头 | `Content-Type: image/jpeg`, `Content-Length: 451823`, `Cache-Control: public, max-age=2592000, immutable` |

说明：本地 Nginx 使用 HTTP 是压测夹具；当前腾讯云公网 IP 演示也使用 HTTP。正式域名上线时应在备案完成后配置 HTTPS 证书。公网 Nginx 对 `/api/` 启用单 IP `10r/s` 限流，命中限流返回 `429`，因此公网 k6 只用于限流内 smoke；容量压测以本地 Nginx 与 Go stress matrix 为准。

## 2. Go Stress Matrix

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
ok  	github.com/100-journeys/app/tests/stress	7.040s
```

覆盖：公开 API、20000 analytics buffer、100 用户、500 订单支付、300 后台统计请求、2000 图片请求。

## 3. k6 结果表

| 脚本 | 档位 | 退出 | HTTP 请求 | 失败率 | Checks | p95 | 结论 |
|---|---:|---:|---:|---:|---:|---:|---|
| `public-content-flow.k6.js` | 200 VU / 30s | 0 | 39193 | 0% | 100% | 61.21 ms | 通过 |
| `image-static-cache.k6.js` | 300 VU / 30s | 0 | 9000 | 0% | 100% | 17.92 ms | 通过，Nginx 静态图片承载有效 |
| `pet-chat-analytics.k6.js` | 200 VU / 30s | 0 | 12000 | 0% | 100% | 8.87 ms | 通过 |
| `order-payment-audit.k6.js` | 80 VU / 30s | 0 | 10240 | 0% | 100% | 574.66 ms | 通过，P0 订单/支付/流水一致 |
| `auth-register-login.k6.js` | 40 VU / 30s | 0 | 2964 | 0% | 100% | 437.77 ms | 通过 |
| `auth-register-login.k6.js` | 120 VU / 30s | 99 | 4552 | 0% | 100% | 2005.08 ms | 功能正确，延迟阈值被打穿 |
| `admin-analytics-export.k6.js` | 10 VU / 30s | 0 | 852 | 0% | 100% | 94.61 ms | 通过 |
| `admin-analytics-export.k6.js` | 60 VU / 30s | 99 | 3198 | 0% | 100% | 598.95 ms | 功能正确，延迟阈值被打穿 |
| `public-content-flow.k6.js` | 公网 IP 1 VU / 10s | 0 | 49 | 0% | 100% | 105.89 ms | 通过，验证腾讯云公网入口与限流内访问 |
| `public-content-flow.k6.js` | 公网 IP 10 VU / 10s | 99 | 560 | 78.57% | 19.37% | 67.28 ms | 触发公网单 IP 限流，不作为服务失败结论 |

## 4. 本轮发现并修复的问题

| 问题 | 现象 | 处理 |
|---|---|---|
| Nginx 静态路径不覆盖代码真实 URL | 代码使用 `/static/css/...`、`/static/js/...`、`/static/assets/...`，Nginx 初版只覆盖旧 `/assets/...` 等路径，导致 CSS/JS 可被 fallback 成 `index.html` | `deploy/nginx.conf` 和本地生成器增加 `/static/css/`、`/static/js/`、`/static/assets/` alias |
| 管理员统计空榜单 JSON 契约不稳定 | 压测早期 `top_clicked_journeys` 可为 `null`，脚本期望数组 | `internal/repository/admin_repo.go` 初始化空 slice，新增回归测试 |
| 本地 Go build cache 权限 | 沙箱不能写 `~/Library/Caches/go-build` | 使用 repo-local `GOCACHE=.cache/go-build` |

## 5. 容量边界结论

- 公开浏览、宠物 mock、静态图片在本地 Nginx 前置后表现稳定。
- P0 订单支付链路在 80 VU 档位通过，说明事务落库和流水一致性未退化。
- 注册登录在 120 VU 档位无功能失败，但 bcrypt、验证码和 SQLite 写入使 p95 升至约 2s。
- 后台 stats/export 在 10 VU 档位通过；60 VU 连续导出无功能失败但 p95 超过 500ms。后台导出不应作为高频公开接口使用。
- 当前结论是“中型独立站 MVP 可用，有明确容量边界”，不是无限生产级。
