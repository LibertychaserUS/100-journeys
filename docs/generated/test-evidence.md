# 生成测试证据矩阵 / Generated Test Evidence Matrix

> 来源：仓库中实际存在的测试文件。

| 测试层 Test layer | 文件 Files | 数量 Count |
|---|---:|---:|
| Go unit/integration / Go 单元集成 | `internal/ai/mock_ai_test.go`, `internal/ai/recommend_engine_test.go`, `internal/analytics/buffer_test.go`, `internal/handler/admin_handler_test.go`, `internal/handler/auth_handler_test.go`, `internal/handler/journey_handler_test.go` ... | 14 |
| Playwright E2E | `e2e/tests/auth.spec.js`, `e2e/tests/detail.spec.js`, `e2e/tests/explore.spec.js`, `e2e/tests/home.spec.js`, `e2e/tests/orders.spec.js` | 5 |
| Playwright support / E2E 支撑文件 | `e2e/tests/helpers.js` | 1 |
| Go stress | `tests/stress/stress_test.go` | 1 |
| k6 load / k6 负载 | `tests/load/admin-analytics-export.k6.js`, `tests/load/auth-register-login.k6.js`, `tests/load/image-static-cache.k6.js`, `tests/load/order-payment-audit.k6.js`, `tests/load/pet-chat-analytics.k6.js`, `tests/load/public-content-flow.k6.js` | 6 |
