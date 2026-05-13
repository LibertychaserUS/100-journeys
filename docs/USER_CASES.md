# 用户角色用例图

> 100种不可思议的旅行 — 用户角色与权限流程

---

## 角色定义

| 角色 | 权限级别 | 描述 |
|---|---|---|
| **游客 (Guest)** | L0 | 未登录用户，可浏览公开内容 |
| **注册用户 (User)** | L1 | 已登录用户，可使用全部核心功能 |
| **管理员 (Admin)** | L2 | 拥有后台管理权限，可查看统计数据 |

---

## 用例图

```mermaid
graph TD
    subgraph 游客权限
        G1[浏览首页]
        G2[探索旅程列表]
        G3[查看旅程详情]
        G4[筛选/搜索旅程]
        G5[注册账号]
        G6[登录账号]
    end

    subgraph 注册用户权限
        U1[浏览首页]
        U2[探索旅程列表]
        U3[查看旅程详情]
        U4[筛选/搜索旅程]
        U5[充值不思议币]
        U6[下单购买旅程]
        U7[支付订单]
        U8[查看订单历史]
        U9[查看交易记录]
        U10[MBTI人格测试]
        U11[查看个人资料]
        U12[退出登录]
    end

    subgraph 管理员权限
        A1[全部用户功能]
        A2[查看用户统计]
        A3[查看旅程统计]
        A4[查看积分发放统计]
    end

    Guest[🧳 游客] --> G1
    Guest --> G2
    Guest --> G3
    Guest --> G4
    Guest --> G5
    Guest --> G6

    User[👤 注册用户] --> U1
    User --> U2
    User --> U3
    User --> U4
    User --> U5
    User --> U6
    User --> U7
    User --> U8
    User --> U9
    User --> U10
    User --> U11
    User --> U12

    Admin[🛡️ 管理员] --> A1
    Admin --> A2
    Admin --> A3
    Admin --> A4

    G5 -->|注册成功| User
    G6 -->|登录成功| User
    U12 -->|退出| Guest
```

---

## 状态流转

```mermaid
stateDiagram-v2
    [*] --> 游客 : 访问网站
    游客 --> 注册用户 : 注册/登录
    注册用户 --> 管理员 : 角色升级为 admin
    注册用户 --> 游客 : 退出登录
    管理员 --> 游客 : 退出登录
```

---

## 页面访问权限矩阵

| 页面 | 游客 | 用户 | 管理员 |
|---|---|---|---|
| 首页 (/#/) | ✅ | ✅ | ✅ |
| 探索 (/#/explore) | ✅ | ✅ | ✅ |
| 详情 (/#/journey/:slug) | ✅ | ✅ | ✅ |
| 登录 (/#/login) | ✅ | ✅ | ✅ |
| 注册 (/#/register) | ✅ | ✅ | ✅ |
| 个人资料 (/#/profile) | ❌ → 跳转登录 | ✅ | ✅ |
| 充值 (/#/recharge) | ❌ → 跳转登录 | ✅ | ✅ |
| 管理员 (/#/admin) | ❌ → 跳转登录 | ❌ → 403 | ✅ |

---

## API 权限矩阵

| 接口 | 游客 | 用户 | 管理员 |
|---|---|---|---|
| GET /api/journeys | ✅ | ✅ | ✅ |
| GET /api/journeys/:slug | ✅ | ✅ | ✅ |
| GET /api/captcha | ✅ | ✅ | ✅ |
| POST /api/auth/register | ✅ | ✅ | ✅ |
| POST /api/auth/login | ✅ | ✅ | ✅ |
| GET /api/auth/me | ❌ | ✅ | ✅ |
| POST /api/orders | ❌ | ✅ | ✅ |
| GET /api/orders | ❌ | ✅ | ✅ |
| POST /api/payments/recharge | ❌ | ✅ | ✅ |
| GET /api/admin/stats | ❌ | ❌ | ✅ |
