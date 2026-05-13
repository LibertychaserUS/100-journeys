# API 契约 — 100 Journeys

**标准**: ISO/IEC/IEEE 29148:2018 — Requirements Engineering
**项目**: 100种不可思议的旅行 · Lightweight Content MVP
**状态**: 与当前代码对齐
**源码依据**: `cmd/server/main.go`、`internal/handler/*.go`、`internal/model/*.go`
**生成证据**: `docs/generated/api-routes.md`

---

## 1. 范围与基线

本文档描述当前 Go + Gin 服务实际暴露的 HTTP API。服务启动后默认监听 `http://localhost:8080`，API 前缀为 `/api`。

当前服务还提供：

- `/static/*`: `./web` 静态文件，长缓存。
- `/uploads/*`: 用户上传头像目录，默认来自 `UPLOAD_DIR`。
- Hash SPA fallback: 非 `/api/`、非静态路径返回 `web/index.html`，并注入 `window.APP_CONFIG = { mediaBase, apiBase: "/api" }`。

本文档只约束 `/api` 下接口，不把未注册路由或前端本地状态描述为已完成后端能力。

---

## 2. 通用约定

### 2.1 Base URL

```text
http://localhost:8080/api
```

### 2.2 响应信封

除 `GET /api/admin/export?format=csv` 返回 CSV 文件外，JSON API 使用统一信封：

```json
{
  "data": {},
  "error": null
}
```

列表接口额外包含分页统计：

```json
{
  "data": [],
  "error": null,
  "total": 0,
  "page": 1,
  "limit": 12
}
```

错误响应使用同一结构：

```json
{
  "data": null,
  "error": "错误信息"
}
```

### 2.3 鉴权

受保护接口使用 JWT Bearer Token：

```http
Authorization: Bearer <token>
```

JWT 用户接口要求已登录；管理员接口还要求 `role = "admin"`。

### 2.4 常见状态码

| 状态码 | 含义 |
|---|---|
| `200` | 请求成功 |
| `201` | 创建成功 |
| `202` | 请求已接收，异步或缓冲写入 |
| `400` | 请求参数或 JSON 不合法 |
| `401` | 未登录、Token 缺失或无效 |
| `403` | 已登录但无管理员权限 |
| `404` | 资源不存在 |
| `409` | 邮箱已注册等冲突 |
| `402` | 支付余额不足 |
| `500` | 服务端错误 |

---

## 3. 公开接口

### 3.1 `GET /api/health`

健康检查。

**响应 `200`**

```json
{
  "data": { "status": "ok" },
  "error": null
}
```

### 3.2 `GET /api/journeys`

获取旅程列表，支持搜索、筛选和分页。

**Query 参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 搜索关键词 |
| `tag` | string | 标签 slug |
| `visual_style` | string | 视觉风格 |
| `fantasy_type` | string | 幻想类型 |
| `adventure_min` | integer | 最小冒险指数 |
| `adventure_max` | integer | 最大冒险指数 |
| `obscurity_min` | integer | 最小小众等级 |
| `mbti` | string | MBTI 类型代码 |
| `page` | integer | 页码，默认由服务层补齐 |
| `limit` | integer | 每页数量，默认由服务层补齐 |

**响应 `200`**

```json
{
  "data": [
    {
      "id": 1,
      "title": "旅程标题",
      "slug": "journey-slug",
      "subtitle": "副标题",
      "story_hook": "故事钩子",
      "region": "地区",
      "fantasy_type": "幻想类型",
      "visual_style": "视觉风格",
      "adventure_index": 8,
      "obscurity_level": 7,
      "risk_level": 3,
      "mood_keywords": ["孤独", "奇遇"],
      "image_url": "/static/assets/images/example.jpg",
      "booking_url": null,
      "price": 299,
      "tags": [{ "id": 1, "name": "标签", "slug": "tag-slug" }],
      "mbti_types": [
        {
          "mbti_type": {
            "id": 1,
            "code": "INFP",
            "name": "调停者",
            "description": "描述",
            "color": "#94a3b8"
          },
          "compatibility_score": 4
        }
      ],
      "created_at": "2026-05-14T00:00:00Z",
      "updated_at": "2026-05-14T00:00:00Z"
    }
  ],
  "error": null,
  "total": 1,
  "page": 1,
  "limit": 12
}
```

### 3.3 `GET /api/journeys/:slug`

获取单个旅程详情。详情响应包含完整 `story` 字段，并会记录一次旅程浏览分析事件。

**Path 参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `slug` | string | 旅程 slug |

**响应 `200`**

```json
{
  "data": {
    "id": 1,
    "title": "旅程标题",
    "slug": "journey-slug",
    "story": "完整故事正文",
    "image_url": "/static/assets/images/example.jpg",
    "price": 299,
    "tags": []
  },
  "error": null
}
```

**响应 `404`**

```json
{
  "data": null,
  "error": "journey not found"
}
```

### 3.4 `GET /api/journeys/:slug/book`

获取旅程预订信息。

**响应 `200`**

```json
{
  "data": {
    "journey_slug": "journey-slug",
    "booking_available": true,
    "booking_url": "https://example.com",
    "partner_name": "合作方",
    "estimated_price_cny": 299,
    "cta_text": "立即预订"
  },
  "error": null
}
```

### 3.5 `GET /api/tags`

获取标签列表。

**响应 `200`**

```json
{
  "data": [
    { "id": 1, "name": "标签", "slug": "tag-slug" }
  ],
  "error": null
}
```

### 3.6 `GET /api/mbti`

获取 MBTI 类型列表。

**响应 `200`**

```json
{
  "data": [
    {
      "id": 1,
      "code": "INFP",
      "name": "调停者",
      "description": "描述",
      "color": "#94a3b8"
    }
  ],
  "error": null
}
```

### 3.7 `GET /api/captcha`

获取注册/登录验证码题目。

**响应 `200`**

```json
{
  "data": {
    "id": "captcha-id",
    "question": "1 + 2 = ?"
  },
  "error": null
}
```

### 3.8 `POST /api/ai/chat`

AI 宠物/推荐对话接口。当前实现使用 mock provider。

**请求 JSON**

```json
{
  "message": "我想去安静一点的地方",
  "session_id": "optional-session-id"
}
```

**响应 `200`**

```json
{
  "data": {
    "reply": "回复文本",
    "actions": [
      {
        "type": "recommend",
        "data": {}
      }
    ]
  },
  "error": null
}
```

### 3.9 `POST /api/analytics/events`

记录前端分析事件。事件进入服务端缓冲区；当缓冲不可用或满载时，`accepted` 可能为 `false`，但接口仍返回 `202`。

**请求 JSON**

```json
{
  "type": "journey_view",
  "journey_slug": "journey-slug",
  "mbti_type": "INFP",
  "gender": "prefer_not_to_say",
  "metadata": "{\"source\":\"home\"}"
}
```

**响应 `202`**

```json
{
  "data": { "accepted": true },
  "error": null
}
```

### 3.10 `POST /api/audit/client-error`

记录前端运行时错误到 `audit_logs`。

**请求 JSON**

```json
{
  "message": "错误信息",
  "path": "#/explore",
  "stack": "可选堆栈"
}
```

**响应 `202`**

```json
{
  "data": { "recorded": true },
  "error": null
}
```

---

## 4. 认证接口

### 4.1 `POST /api/auth/register`

注册普通用户。注册成功后授予 5000 积分并返回 JWT。

**请求 JSON**

```json
{
  "username": "用户名",
  "email": "user@example.com",
  "password": "abc12345",
  "gender": "prefer_not_to_say",
  "captcha_id": "captcha-id",
  "captcha_answer": "3"
}
```

**字段约束**

| 字段 | 约束 |
|---|---|
| `username` | 2-30 位，允许中文、英文字母、数字、下划线、连字符 |
| `email` | 邮箱格式 |
| `password` | 8-72 位，必须同时包含字母和数字，不允许空格、引号、分号或尖括号 |
| `gender` | `female`、`male`、`non_binary`、`prefer_not_to_say` |
| `captcha_id` / `captcha_answer` | 必填 |

**响应 `201`**

```json
{
  "data": {
    "token": "jwt-token",
    "expires_in": 604800,
    "user": {
      "id": 1,
      "username": "用户名",
      "email": "user@example.com",
      "role": "user",
      "level": 1,
      "points": 5000,
      "balance": 0,
      "gender": "prefer_not_to_say",
      "created_at": "2026-05-14T00:00:00Z",
      "updated_at": "2026-05-14T00:00:00Z"
    }
  },
  "error": null
}
```

### 4.2 `POST /api/auth/login`

用户登录。登录成功后返回 JWT，并尝试增加登录积分。

**请求 JSON**

```json
{
  "email": "user@example.com",
  "password": "abc12345",
  "captcha_id": "captcha-id",
  "captcha_answer": "3"
}
```

**响应 `200`**: 同 `AuthResponse`。

### 4.3 `GET /api/auth/me`

获取当前登录用户。

**鉴权**: JWT

**响应 `200`**

```json
{
  "data": {
    "id": 1,
    "username": "用户名",
    "email": "user@example.com",
    "role": "user",
    "level": 1,
    "points": 5010,
    "balance": 0,
    "mbti_type": "INFP",
    "gender": "prefer_not_to_say",
    "avatar_url": "/uploads/avatars/u_1/avatar.jpg",
    "created_at": "2026-05-14T00:00:00Z",
    "updated_at": "2026-05-14T00:00:00Z"
  },
  "error": null
}
```

### 4.4 `POST /api/auth/avatar`

上传头像。

**鉴权**: JWT
**Content-Type**: `multipart/form-data`

**表单字段**

| 字段 | 类型 | 约束 |
|---|---|---|
| `avatar` | file | 最大 512KB；仅允许 JPEG、PNG、WebP |

**响应 `200`**

```json
{
  "data": {
    "avatar_url": "/uploads/avatars/u_1/avatar.jpg",
    "user_id": 1
  },
  "error": null
}
```

**边界说明**: 源码中存在 `SaveJourney` handler 草稿，但当前没有注册 `/api/auth/save/:slug` 路由；收藏/保存旅程能力尚未完成，不能作为已交付 API。

---

## 5. 订单接口

订单接口全部需要 JWT。

### 5.1 `POST /api/orders`

创建订单。服务端根据 `journey_slug` 查找旅程，并根据用户积分计算折扣。

**请求 JSON**

```json
{
  "items": [
    {
      "journey_slug": "journey-slug",
      "quantity": 1
    }
  ]
}
```

**响应 `201`**

```json
{
  "data": {
    "id": 1,
    "order_no": "ORD-...",
    "user_id": 1,
    "status": "pending",
    "total_amount": 299,
    "currency": "WONDER",
    "items": [
      {
        "id": 1,
        "order_id": 1,
        "journey_id": 1,
        "journey_title": "旅程标题",
        "unit_price": 299,
        "quantity": 1,
        "subtotal": 299
      }
    ],
    "created_at": "2026-05-14T00:00:00Z",
    "updated_at": "2026-05-14T00:00:00Z"
  },
  "error": null
}
```

### 5.2 `GET /api/orders`

获取当前用户订单列表。

**响应 `200`**

```json
{
  "data": [],
  "error": null
}
```

### 5.3 `GET /api/orders/:id`

获取当前用户的单个订单。用户只能访问自己的订单。

**响应 `200`**: `Order` 对象信封。

### 5.4 `POST /api/orders/:id/pay`

支付订单。余额不足时返回 `402`。

**响应 `200`**

```json
{
  "data": { "paid": true },
  "error": null
}
```

---

## 6. 钱包接口

钱包接口全部需要 JWT。

### 6.1 `POST /api/payments/recharge`

模拟充值。

**请求 JSON**

```json
{
  "amount": 1000
}
```

**约束**: `amount` 范围为 `1-100000`。

**响应 `200`**

```json
{
  "data": { "recharged": 1000 },
  "error": null
}
```

### 6.2 `GET /api/payments/transactions`

获取当前用户钱包流水。

**响应 `200`**

```json
{
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "order_id": null,
      "txn_type": "recharge",
      "amount": 1000,
      "balance_after": 1000,
      "description": "模拟充值",
      "created_at": "2026-05-14T00:00:00Z"
    }
  ],
  "error": null
}
```

---

## 7. 管理员接口

管理员接口全部需要 JWT 且用户角色为 `admin`。

### 7.1 `GET /api/admin/users`

获取后台用户列表。

**响应 `200`**

```json
{
  "data": [],
  "error": null
}
```

### 7.2 `GET /api/admin/stats`

获取后台聚合统计。

**响应 `200`**

```json
{
  "data": {
    "total_users": 0,
    "total_journeys": 0,
    "total_points": 0,
    "total_balance": 0,
    "total_orders": 0,
    "paid_orders": 0,
    "gross_revenue": 0,
    "total_transactions": 0,
    "analytics_events": 0,
    "audit_logs": 0,
    "audit_errors": 0,
    "top_clicked_journeys": [],
    "top_purchased_journeys": [],
    "mbti_distribution": [],
    "gender_distribution": [],
    "purchase_gender_distribution": []
  },
  "error": null
}
```

### 7.3 `GET /api/admin/export`

导出后台统计。默认 JSON；`format=csv` 时返回 CSV 文件。

**Query 参数**

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `format` | string | `json` | `json` 或 `csv` |

**响应 `200`, JSON 模式**: 同 `GET /api/admin/stats`。

**响应 `200`, CSV 模式**

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="100-journeys-admin-stats.csv"
```

CSV 模式不使用 JSON 信封。

---

## 8. 数据模型摘要

### 8.1 Journey

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer | 旅程 ID |
| `title` | string | 标题 |
| `slug` | string | URL 标识 |
| `subtitle` | string | 副标题，可省略 |
| `story_hook` | string | 故事钩子，可省略 |
| `story` | string | 完整故事，详情页使用 |
| `region` | string | 地区 |
| `fantasy_type` | string | 幻想类型 |
| `visual_style` | string | 视觉风格 |
| `adventure_index` | integer | 冒险指数 |
| `obscurity_level` | integer | 小众等级 |
| `risk_level` | integer | 风险等级 |
| `mood_keywords` | string[] | 情绪关键词 |
| `image_url` | string | 服务层解析后的本地或 CDN 图片地址 |
| `booking_url` | string/null | 外部预订地址 |
| `price` | integer | 价格，单位为分或项目约定整数金额 |
| `tags` | Tag[] | 标签 |
| `mbti_types` | JourneyMBTI[] | MBTI 匹配信息 |
| `created_at` / `updated_at` | string | Go `time.Time` JSON 格式 |

### 8.2 User

`password_hash` 永不出现在 JSON 响应中。公开字段包括 `id`、`username`、`email`、`role`、`level`、`points`、`balance`、`mbti_type`、`gender`、`avatar_url`、`created_at`、`updated_at`。

### 8.3 Order

订单状态来自当前模型常量：`pending`、`paid`、`cancelled`、`refunded`。

### 8.4 Transaction

流水类型来自当前模型常量：`recharge`、`purchase`、`refund`、`bonus`。`amount` 为正表示入账，为负表示扣款。

---

## 9. 已知边界

- 收藏/保存旅程尚未完成；不得在产品或接口文档中描述为已可用。
- `POST /api/ai/chat` 当前是 mock AI provider，不代表真实外部大模型已接入。
- `POST /api/analytics/events` 是可降级分析事件，不承载订单、支付、钱包等 P0 事实。
- `GET /api/admin/export?format=csv` 是唯一不使用 JSON 信封的已注册 API。
