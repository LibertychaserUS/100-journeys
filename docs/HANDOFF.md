# HANDOFF — 100种不可思议的旅行

> 交接日期: 2026-05-13
> 交接人: AI Agent (Claude)
> 接收人: 后续开发者
> Git: `main` @ `5655ec3`

---

## 1. 项目概况

**100种不可思议的旅行** — 轻量级 MVP Web 应用，展示奇幻旅行体验。
- Go 1.26 + Gin + SQLite (pure Go, no CGO)
- Vanilla HTML/CSS/JS 前端，Hash-based SPA
- 8 个前端路由，完整的用户系统 + 订单支付流程

---

## 2. 已完成的功能（可正常工作）

### 前端
| 页面 | 状态 | 说明 |
|------|------|------|
| 首页 (`/`) | 完成 | Hero + 统计栏 + 精选旅程卡片网格 |
| 探索 (`/explore`) | 完成 | 搜索 + 5维筛选 + Masonry 卡片 + 无限滚动 |
| 详情 (`/journey/:slug`) | 完成 | 故事阅读 + 元信息 + 视觉风格主题切换 |
| 登录 (`/login`) | 完成 | 邮箱+密码+数学题验证码 + JWT |
| 注册 (`/register`) | 完成 | 同上 + 自动登录 |
| 个人中心 (`/profile`) | 完成 | 资料 + 订单历史 + 交易流水 + MBTI 展示 |
| 充值 (`/recharge`) | 完成 | 7档游戏风充值 + 自定义金额 |
| 管理后台 (`/admin`) | **部分** | 仅3个统计卡片，数据硬编码 |
| AI 宠物 | 完成 | 领养引导 + MBTI 测试 + 聊天推荐 + 触发器 |
| 深色/浅色模式 | 完成 | localStorage 持久化 |

### 后端
| 接口 | 状态 |
|------|------|
| `GET /api/journeys` | 完成，支持分页+筛选 |
| `GET /api/journeys/:slug` | 完成 |
| `GET /api/tags` | 完成 |
| `GET /api/mbti` | 完成 |
| `POST /api/auth/register` | 完成 |
| `POST /api/auth/login` | 完成 |
| `GET /api/auth/me` | 完成 |
| `POST /api/orders` | 完成 |
| `GET /api/orders` | 完成 |
| `POST /api/orders/:id/pay` | 完成 |
| `POST /api/payments/recharge` | 完成 |
| `GET /api/payments/transactions` | 完成 |
| `GET /api/admin/stats` | **硬编码** 返回 0 |
| `GET /api/admin/users` | **空数组** |
| `POST /api/ai/chat` | 完成，规则引擎 |

### 测试
- Go 单元/集成测试: **51/51 通过**
- Playwright E2E 测试: **29/29 通过**

---

## 3. 已知 Bug（已修复 & 未修复）

### 已修复 ✅
| 问题 | 修复方式 |
|------|----------|
| 图片 404 | `web/static/assets/images/` → `web/assets/images/` 移动了 14 张图片 |
| 首页/探索页图片双前缀 | 前端代码里删掉了 `API.mediaUrl()` 双重包装 |
| MBTI 标签显示 `[object Object]` | 改为读取 `item.mbti_type.code` |
| AI 宠物 quiz 显示 `<strong>ESFJ</strong>` | 去掉 HTML 标签，使用纯文本 |
| AI 宠物推荐无链接 | 推荐结果改为可点击的 `<a>` 标签，跳转详情页 |

### 未修复 ❌
| 问题 | 严重度 | 说明 |
|------|--------|------|
| **粒子动效缺失** | P1 | 预期首页 Hero 区域有 Canvas 粒子/星空动效，目前只有 CSS `ambient-drift` 渐变漂移 |
| **AI 宠物 localStorage Key 不一致** | P2 | `ai-pet-dom.js` 使用 `AIPet.getProfile()`，但实际存储 key 是 `ai_pet_profile`，需确认多端一致性 |
| **Admin 统计硬编码** | P2 | `/api/admin/stats` 返回 `total_users: 0, total_points: 0`，未查询真实数据 |
| **Admin 用户列表为空** | P2 | `/api/admin/users` 直接返回 `[]model.User{}` |
| **收藏旅程未实现** | P3 | `auth_handler.go:162` 有 TODO: `resolve slug to journey_id` |
| **AI 宠物触发器计数 bug** | P3 | `pageViewCount` 在每次 hashchange 时累加，但刷新页面会重置 |
| **Admin 分页缺失** | P3 | `admin_handler.go:23` 有 TODO |

---

## 4. 缺失的功能清单（完整）

### 视觉 & 交互
- [ ] **Canvas 粒子/星空动效** — 首页 Hero 背景预期有动态粒子效果
- [ ] **页面过渡动画** — 路由切换无过渡动画
- [ ] **加载骨架屏优化** — 部分页面骨架屏样式简陋
- [ ] **图片懒加载占位符** — 无模糊渐进加载效果

### 管理后台
- [ ] **用户列表** — 表格展示、分页、搜索
- [ ] **旅程 CRUD** — 创建/编辑/删除旅程
- [ ] **标签管理** — 增删改查
- [ ] **MBTI 关联管理** — 批量绑定
- [ ] **真实统计数据** — 从数据库聚合

### 用户功能
- [ ] **收藏/心愿单** — 保存旅程到个人资料
- [ ] **密码重置** — 忘记密码流程
- [ ] **邮箱验证** — 注册后验证
- [ ] **用户头像上传** — 默认无头像系统
- [ ] **通知系统** — 订单状态变更通知

### 性能 & 工程
- [ ] **缓存层** — `docs/trace/checkpoints/CP-DDD-001.md` 提到 sync.Map LRU 缓存未实现
- [ ] **图片 CDN 切换验证** — 代码支持但未完整测试
- [ ] **数据库索引优化** — 大规模数据下可能慢
- [ ] **API 限流** — 无 Rate Limiting

### 测试
- [ ] **Admin 接口测试** — 无覆盖
- [ ] **支付流程 E2E** — 充值/下单/支付链路需更多场景
- [ ] **性能测试** — 无压力测试

---

## 5. 关键文件位置

```
100-journeys/
├── cmd/server/main.go          # 入口
├── internal/
│   ├── handler/                # HTTP 处理器
│   ├── service/                # 业务逻辑 + MediaProvider
│   ├── repository/             # SQLite 数据访问
│   ├── model/                  # 数据结构
│   ├── middleware/             # JWT, CORS, Logger
│   └── ai/                     # Mock AI + 推荐引擎
├── db/
│   ├── schema.sql              # DDL
│   └── seed.sql                # 5 条旅程 + 16 MBTI 类型
├── web/
│   ├── index.html              # SPA 壳
│   ├── css/                    # tokens → global → layout → components → pages
│   ├── js/
│   │   ├── api.js              # HTTP 客户端
│   │   ├── router.js           # Hash 路由
│   │   ├── ai-pet.js           # AI 引擎
│   │   ├── ai-pet-dom.js       # AI 宠物 DOM 控制器
│   │   └── pages/              # 8 个页面控制器
│   └── assets/images/          # 14 张本地图片
├── tests/                      # Go 单元/集成测试
├── e2e/                        # Playwright 测试
└── docs/                       # 设计文档、追踪日志
```

---

## 6. 启动命令

```bash
# 开发模式（默认 8090）
./start.sh

# 指定端口
./start.sh 8080

# 编译后运行（更快）
./start.sh -b

# 重置数据库
./start.sh -r
```

---

## 7. 环境要求

- Go 1.26.3+
- Node.js（仅 E2E 测试需要）
- 端口 8090（默认）

---

## 8. 数据库

- SQLite 文件: `./data/app.db`
- 每次启动自动 migrate + seed（幂等，`INSERT OR IGNORE`）
- 重置: 删 `data/app.db` 或 `./start.sh -r`

---

## 9. 下一步建议（优先级排序）

1. **P0: Canvas 粒子动效** — 用户明确要求的视觉亮点
2. **P1: Admin 统计真实化** — 查询真实聚合数据
3. **P1: Admin 用户列表** — 基础表格 + 分页
4. **P2: 收藏旅程** — 补全 TODO
5. **P2: 缓存层** — 提升列表页性能
6. **P3: 密码重置** — 完整用户闭环

---

> 如有疑问，检查 `docs/trace/` 目录下的 checkpoint 文件和 `DEVELOPMENT_LOG.md`。
