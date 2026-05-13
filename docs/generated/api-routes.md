# 生成 API 路由矩阵 / Generated API Route Matrix

> 来源：`cmd/server/main.go` 与 handler route registration helpers。

| 方法 Method | 路径 Path | 鉴权 Auth | 来源 Source |
|---|---|---|---|
| `GET` | `/api/admin/export` | Admin | `internal/handler/admin_handler.go` |
| `GET` | `/api/admin/stats` | Admin | `internal/handler/admin_handler.go` |
| `GET` | `/api/admin/users` | Admin | `internal/handler/admin_handler.go` |
| `POST` | `/api/ai/chat` | Public | `cmd/server/main.go` |
| `POST` | `/api/analytics/events` | Public | `cmd/server/main.go` |
| `POST` | `/api/audit/client-error` | Public | `cmd/server/main.go` |
| `POST` | `/api/auth/avatar` | JWT | `cmd/server/main.go` |
| `POST` | `/api/auth/login` | Public | `cmd/server/main.go` |
| `GET` | `/api/auth/me` | JWT | `cmd/server/main.go` |
| `POST` | `/api/auth/register` | Public | `cmd/server/main.go` |
| `GET` | `/api/captcha` | Public | `cmd/server/main.go` |
| `GET` | `/api/health` | Public | `cmd/server/main.go` |
| `GET` | `/api/journeys` | Public | `cmd/server/main.go` |
| `GET` | `/api/journeys/:slug` | Public | `cmd/server/main.go` |
| `GET` | `/api/journeys/:slug/book` | Public | `cmd/server/main.go` |
| `GET` | `/api/mbti` | Public | `cmd/server/main.go` |
| `GET` | `/api/orders` | JWT | `internal/handler/order_handler.go` |
| `POST` | `/api/orders` | JWT | `internal/handler/order_handler.go` |
| `GET` | `/api/orders/:id` | JWT | `internal/handler/order_handler.go` |
| `POST` | `/api/orders/:id/pay` | JWT | `internal/handler/order_handler.go` |
| `POST` | `/api/payments/recharge` | JWT | `internal/handler/payment_handler.go` |
| `GET` | `/api/payments/transactions` | JWT | `internal/handler/payment_handler.go` |
| `GET` | `/api/tags` | Public | `cmd/server/main.go` |
