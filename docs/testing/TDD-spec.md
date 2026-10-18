# TDD 测试规格说明 - 100 Journeys

**文档语言**: 中文
**对齐标准**: ISO/IEC/IEEE 29119-3 测试文档风格
**更新日期**: 2026-05-14
**适用分支**: `feature/taoyuan-production-readiness` / worktree `.worktrees/frontend-redesign`
**代码依据**: `cmd/server/main.go`、`internal/handler/*_test.go`、`internal/repository/*_test.go`、`internal/service/*_test.go`、`e2e/tests/*.spec.js`、`tests/stress/stress_test.go`、`tests/load/*.k6.js`

> 本文档只记录当前代码与本轮可验证事实。旧会话的测试结果单独列为“历史证据”，不得替代本轮验证结论。

---

## 1. 测试计划

### 1.1 测试目标

本项目采用 Go + Gin + SQLite (`modernc.org/sqlite`) + Vanilla HTML/CSS/JS Hash SPA。测试目标是验证以下质量属性：

- 功能正确性：旅程列表、详情、标签、MBTI、AI 聊天、验证码、注册登录、用户信息、头像、后台统计、订单、支付、充值、交易流水、审计与分析事件。
- 接口一致性：API 返回标准 envelope，前端通过 `window.APP_CONFIG` 读取配置，路由与测试入口一致。
- 数据安全性：仓储层参数化查询，认证接口拒绝普通用户注入管理员角色，订单支付保持事务一致。
- 可靠性：SQLite 单写边界下订单、钱包、交易流水不丢失；P2 分析事件可批量写入并记录容量风险。
- 前端可用性：Hash SPA 主要页面可访问，浏览、搜索、筛选、详情、登录注册、充值和订单流程可由 Playwright 覆盖。
- 生产就绪风险：k6 负载脚本、Go stress、Nginx 代理与静态资源分发需要独立验证。

### 1.2 测试范围

| 层级 | ID 前缀 | 范围 | 当前代码位置 |
|---|---|---|---|
| 单元测试 | `UT-*` | repository、service、AI、middleware、analytics buffer | `internal/**/*_test.go` |
| 集成测试 | `IT-*` | Gin handler + 临时 SQLite + 真实路由行为 | `internal/handler/*_test.go` |
| 浏览器端到端 | `E2E-*` | Hash SPA 用户路径 | `e2e/tests/*.spec.js` |
| Go 压力测试 | `STRESS-*` | 公开浏览、分析 buffer、订单支付、后台统计、静态图 | `tests/stress/stress_test.go` |
| k6 负载测试 | `LOAD-K6-*` | 运行中服务 API/静态资源负载 | `tests/load/*.k6.js` |
| Nginx 验证 | `NGINX-*` | 语法、反向代理、静态资源缓存、健康检查 | `deploy/nginx.conf` |

### 1.3 不在本轮范围

- 不修改业务代码、测试代码、README、部署配置或 trace 文件。
- 不将未执行的 Playwright、k6、Nginx 检查标记为通过。
- 不把旧文档中的“全部通过”作为当前结论。

---

## 2. 被测对象与接口清单

### 2.1 后端 API 路由

当前 `cmd/server/main.go` 暴露以下路由族：

| 路由族 | 方法与路径 | 认证 | 覆盖方向 |
|---|---|---|---|
| 旅程公开接口 | `GET /api/journeys`、`GET /api/journeys/:slug`、`GET /api/journeys/:slug/book` | 否 | `UT-REPO-*`、`UT-SVC-*`、`IT-API-*`、`E2E-*`、`LOAD-K6-PUBLIC-*`、`STRESS-PUBLIC-*` |
| 元数据接口 | `GET /api/tags`、`GET /api/mbti` | 否 | `IT-API-*`、`E2E-HOME-*`、`E2E-EXPLORE-*` |
| AI 与分析 | `POST /api/ai/chat`、`POST /api/analytics/events` | 否 | `UT-AI-*`、`UT-ANALYTICS-*`、`LOAD-K6-PET-*`、`STRESS-ANALYTICS-*` |
| 审计与健康 | `POST /api/audit/client-error`、`GET /api/health` | 否 | `IT-AUDIT-*`、`LOAD-K6-PUBLIC-*`、`NGINX-PROXY-*` |
| 验证码与认证 | `GET /api/captcha`、`POST /api/auth/register`、`POST /api/auth/login` | 否 | `IT-AUTH-*`、`E2E-AUTH-*`、`LOAD-K6-AUTH-*` |
| 受保护认证 | `GET /api/auth/me`、`POST /api/auth/avatar` | JWT | `IT-AUTH-*`、`E2E-AUTH-*` |
| 后台管理 | `GET /api/admin/users`、`GET /api/admin/stats`、`GET /api/admin/export` | JWT + admin | `IT-ADMIN-*`、`LOAD-K6-ADMIN-*`、`STRESS-ADMIN-*` |
| 订单 | `POST /api/orders`、`GET /api/orders`、`GET /api/orders/:id`、`POST /api/orders/:id/pay` | JWT | `UT-REPO-ORDER-*`、`IT-ORDER-*`、`E2E-ORDER-*`、`STRESS-ORDER-*` |
| 支付 | `POST /api/payments/recharge`、`GET /api/payments/transactions` | JWT | `IT-PAYMENT-*`、`E2E-ORDER-*`、`LOAD-K6-ORDER-*` |

### 2.2 前端 Hash 路由

当前 `web/js/router.js` 注册以下页面：

| 路由 | 页面模块 | E2E 覆盖方向 |
|---|---|---|
| `#/` | `Pages.Home` | `E2E-HOME-*` |
| `#/explore` | `Pages.Explore` | `E2E-EXPLORE-*` |
| `#/journey/:slug` | `Pages.Detail` | `E2E-DETAIL-*`、`E2E-ORDER-*` |
| `#/login` | `Pages.Login` | `E2E-AUTH-*` |
| `#/register` | `Pages.Register` | `E2E-AUTH-*` |
| `#/profile` | `Pages.Profile` | `E2E-AUTH-*`、`E2E-ORDER-*` |
| `#/admin-login` | `Pages.AdminLogin` | `E2E-ADMIN-*` |
| `#/admin` | `Pages.Admin` | `E2E-ADMIN-*` |
| `#/recharge` | `Pages.Recharge` | `E2E-ORDER-*` |
| `#/about` | `Pages.About` | `E2E-HOME-*` 或补充 smoke |

---

## 3. 测试设计

### 3.1 测试设计原则

- Red -> Green -> Refactor：新增或修复功能前，先补稳定测试 ID 对应的失败用例，再实现代码，再重构。
- 测试 ID 稳定：文档、测试文件、缺陷记录和结果记录使用同一 ID。
- 后端核心逻辑优先 Go 测试：repository/service/handler 的失败比浏览器失败更早定位。
- 前端体验用 Playwright 验证：Hash 路由、表单、跳转、余额、订单和控制台错误由 E2E 覆盖。
- 压测不等于生产承诺：Go stress 和 k6 记录瓶颈；Nginx/CDN 未验证前不能宣称静态资源生产就绪。

### 3.2 测试数据策略

- Go 单元/集成测试使用临时 SQLite 或测试 helper 初始化数据。
- `db/schema.sql` 是 DDL 权威来源，`db/seed.sql` 提供样例旅程。
- Playwright 使用本地 `PORT=8090 go run cmd/server/main.go` 启动服务。
- k6 默认针对运行中的 `BASE_URL`，不得自动修改数据库或部署配置。
- 压力测试参数通过环境变量配置，避免硬编码容量结论。

### 3.3 环境与命令

必备命令清单：

```bash
python3 scripts/docs/generate_project_artifacts.py
go test ./...
go vet ./...
find web/js -name '*.js' -exec node --check {} \;
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
k6 run tests/load/public-content-flow.k6.js
k6 run tests/load/auth-register-login.k6.js
k6 run tests/load/order-payment-audit.k6.js
k6 run tests/load/admin-analytics-export.k6.js
k6 run tests/load/pet-chat-analytics.k6.js
k6 run tests/load/image-static-cache.k6.js
scripts/nginx/render-local-config.sh 18080 18081
nginx -t -c "$PWD/deploy/nginx.local.conf" -p "$PWD/.nginx"
curl -fsS http://127.0.0.1:18080/api/health
```

说明：`python3 scripts/docs/generate_project_artifacts.py` 会生成项目文档产物。本轮主线程已执行并生成 `docs/generated/*`。

---

## 4. 测试用例矩阵

### 4.1 单元测试矩阵

| ID | 对象 | 现有测试事实 | 预期 |
|---|---|---|---|
| `UT-REPO-JOURNEY-001` | `JourneyRepository.List` | 覆盖全部列表、tag、visual_style、fantasy_type、adventure、MBTI、搜索、分页 | 查询结果、总数、分页与筛选条件一致 |
| `UT-REPO-JOURNEY-002` | `JourneyRepository.GetBySlug` | 覆盖存在与不存在 slug | 存在返回详情，不存在返回 not found |
| `UT-REPO-USER-001` | `UserRepository` | 覆盖创建、按 email/id 查询、积分、收藏、积分历史空列表 | 用户与账户字段持久化正确 |
| `UT-REPO-ORDER-001` | `OrderRepository.Create/Get/List` | 覆盖创建、读取、用户订单列表 | 订单项、金额、归属关系正确 |
| `UT-REPO-ORDER-002` | `OrderRepository.Pay` | 覆盖成功、余额不足、已支付、用户不匹配 | 支付事务保持订单、余额、交易流水一致 |
| `UT-SVC-JOURNEY-001` | `JourneyService` | 覆盖默认列表、图片地址解析、详情、标签、booking、错误分支、MBTI | service 不硬编码媒体路径，错误向上返回 |
| `UT-AI-001` | `MockAI` | 覆盖推荐、MBTI、问候、风险、fallback | 按输入关键词返回预期文本类型 |
| `UT-AI-002` | `RecommendEngine` | 覆盖 MBTI、关键词、fallback、limit、无匹配 | 推荐排序与数量符合规则 |
| `UT-MW-001` | JWT middleware | 覆盖缺失、格式错误、无效、有效、过期、admin 权限 | JWT 与 admin gate 行为正确 |
| `UT-MW-002` | CORS / RequestID | 覆盖允许源、拒绝源、预检、暴露头、request id 生成/保留 | 中间件响应头符合预期 |
| `UT-CONTENT-001..004` | `internal/content` | 每个入口文件：结构、词表、封面存在、编号与 slug 唯一；文案不出现类型代码与说教词 | 全部入口可上线，lint 能抓到「因为你是 INFP」类句子 |
| `UT-AI-DS-001` | `DeepSeek.Guide` 正常回复 | 假上游返回含未知与重复 slug 的 JSON | 只保留目录里的旅程并带本地化标题；Bearer 鉴权；`max_tokens` 320、JSON 输出；系统提示词含目录、类型（仅用于挑选）与不说出类型的规则 |
| `UT-AI-DS-002` | 回退 | 超时、500、非 JSON、空回复、错误地址 | 都回退到规则引擎（`source: mock`），1 秒内返回 |
| `UT-AI-DS-003` | 并发上限 | 唯一的槽位被占用 | 立即回退，不排队 |
| `UT-AI-DS-004` | 日志 | 上游 400 | 日志只有状态码，没有密钥、用户消息或回复 |
| `UT-CONTENT-005` | 文案公理 | 章节标题是「入口」「The light comes in.」这类导游式阶段名 | 校验报错；具体意象标题通过 |
| `UT-CONTENT-SCENE-001` | 场景美术数据 | 每段旅程的 scenes/<slug>.json | 标志动作、质感、光线弧、节拍、配色合法，图片存在，seed 里每段旅程都有 |
| `UT-CONTENT-IMG-001` | 响应式图片 | generated 下每张封面、场景图 | AVIF 与 WebP 各宽度齐全 |
| `UT-WEB-005` | 资源打包 | index.html 列出的 CSS/JS | 合并成一个样式表和一个脚本，顺序不变，gzip 一致，拒绝 css/ js/ 之外的路径 |
| `UT-WEB-006` | 分享页预加载 | 生成封面 vs 无衍生图的图片 | 生成封面带 AVIF 类型预加载，其他不加 |
| `UT-WEB-004` | 分享页 | /j/:slug 的 Open Graph 标签 | 标题、描述替换并转义，默认分享标签移除，只剩一组 |
| `UT-ANALYTICS-002` | 漏斗事件类型 | 每个漏斗步骤都是已登记事件，未知类型被丢弃 | 后台漏斗不会因为事件被拒而缺步 |
| `UT-REPO-MIGRATE-001` | `Migrate` | 旧库的 analytics_events CHECK 只有 5 种类型 | 重建表后接受新类型，旧数据与 4 个索引保留，再次迁移不变 |
| `UT-REPO-USER-CHOICE-001` | `UserRepository.SetChoice/ListChoices` | 同一入口重复选择 | 后一次覆盖，按 slug 返回 |
| `UT-ANALYTICS-001` | analytics buffer | 覆盖 flush 持久化和五位数 burst 接收 | 未超过容量时不丢事件 |

### 4.2 集成测试矩阵

| ID | 对象 | 现有测试事实 | 预期 |
|---|---|---|---|
| `IT-API-JOURNEY-001` | 旅程 handler | 覆盖 list、filter、get、not found、tags、mbti、booking、分页、非法 query | HTTP 状态码、envelope 与数据一致 |
| `IT-API-AI-001` | AI chat handler | 覆盖正常和非法请求 | 正常返回回复，非法请求返回错误 |
| `IT-AUTH-001` | 注册登录 | 覆盖成功、重复 email、校验错误、重复 username、弱用户名/密码 | bcrypt/JWT/校验逻辑正确 |
| `IT-AUTH-002` | 权限安全 | 覆盖注册时忽略注入 admin role、`/auth/me` token、头像绑定服务端账户身份 | 普通用户不能伪造 admin 或越权上传 |
| `IT-ADMIN-001` | 后台权限 | 覆盖 admin 可访问、普通用户 forbidden、无 token 拒绝 | admin gate 生效 |
| `IT-ADMIN-002` | 后台统计/export | 覆盖真实数据库聚合、50 个虚拟用户 HTTP 行为 | 统计与导出反映真实数据 |
| `IT-ORDER-001` | 订单创建/列表/支付 | 覆盖创建、折扣、列表、支付成功、余额不足 | 订单、余额、交易流水一致 |
| `IT-PAYMENT-001` | 充值与流水 | 覆盖充值成功、未授权、充值后 transactions | 钱包余额和交易记录正确 |
| `IT-API-HEALTH-001` | 健康检查 | 覆盖 `/api/health` | 返回健康状态 |
| `IT-API-I18N-001..004` | 双语内容 | `?lang=en` 列表/详情为英文、默认中文、英文与中文搜索 | 所有旅程都有英文，`locale` 字段正确；搜索断言读取内容文件，不写死标题 |
| `IT-API-MEDIA-001` | 封面 | 每段旅程封面唯一 | 不再出现多段旅程共用一张图 |
| `IT-API-MBTI-ORDER-001` | MBTI 匹配顺序 | `mbti_types` 按匹配度降序 | 「最匹配」取第一项 |
| `IT-CONTENT-001` | `content.Sync` | 写入 journeys / 翻译 / 入口 / 结构化内容 / 标签 / MBTI，第二次同步不变 | 幂等 |
| `IT-CONTENT-002` | 重启 | 同一数据库再跑一次 seed.sql 和 Sync | 标题、英文标题、封面、标签、MBTI 仍是入口文件里的，不回退到 seed |
| `IT-API-CONTENT-001` | 入口内容 | 详情带 `entrance` 与完整 `content`，列表只带 `opens`、`role` | 字段与 JSON 文件一致，未写入口的旅程不带内容 |
| `IT-API-CHOICE-001` | 岔路选择 | 合法选项 / 非法选项 / 未知入口 / 未登录 | 200 / 400 / 404 / 401，`GET` 返回账户里的选择 |
| `IT-API-MERGE-001` | 访客合并 | 类型 + 选择（含不存在的入口），重复两次；空请求；非法类型 | 幂等；跳过项列在 `skipped`；空请求保留账户类型；非法类型 400 |
| `IT-API-FUNNEL-001` | 后台漏斗 | 4 位访客各走到不同步骤，重复到达 | 按访客去重、按步骤顺序、比例相对到达 |
| `IT-API-EVENT-002` | 事件大小 | metadata 超过 512 字符 | 400 `event too large` |
| `IT-API-AI-002` | 向导接口 + DeepSeek | 英文、带类型；超长消息 | `source: deepseek`，只推荐真实旅程且标题为英文，提示词为英文并带类型；1001 字 400 |
| `IT-API-SAVED-001..003` | 收藏 | 收藏/幂等/取消/本地化/未登录/不存在 | `/api/auth/saved` 往返一致 |
| `IT-API-MBTI-001` | 保存人格 | 合法与非法代码 | `/auth/me` 返回保存的 `mbti_type` |
| `IT-API-PAY-001..003` | 充值档位与赠送 | 档位公开、档位赠送入账两条流水、自定义金额无赠送 | 余额 = 本金 + 赠送 |
| `IT-API-AUTH-POINTS-001` | 每日登录奖励 | 同日多次登录 | 只奖励一次 |
| `UT-WEB-001..003` | `internal/webapp` | 配置注入与转义、资源版本号、文件变化后版本变化 | 不残留占位符，不可注入 script |
| `UT-SVC-LOCALE-001` | 语言归一化 | `en-US`、`zh-CN`、未知语言 | 归一到 `en` / `zh` |

### 4.3 E2E 测试矩阵

| ID | 文件 | 当前脚本事实 | 本轮状态 |
|---|---|---|---|
| `E2E-HOME-001..005` | `e2e/tests/home.spec.js` | hero、5 个精选、心情入口带筛选跳转、搜索带 query、卡片跳转、封面不重复 | 通过 |
| `E2E-EXPLORE-001..008` | `e2e/tests/explore.spec.js` | 首屏卡片数 = min(API total, 每页 12)；幻想类型筛选后结果数与 API 一致（旧版停在骨架屏）；搜索框可点击、输入时保持焦点（旧版被导航遮住）；筛选面板组合与移除；空状态清除；卡片跳转；从导航重新进入不残留筛选；带参链接还原 | 通过 |
| `E2E-SPACE-001..005` | `e2e/tests/space.spec.js` | 首页邀请 → 类型牌 → 你的空间；小旅六步对话（刷新后续上、上一步）→ 揭晓 → 空间；“不确定”转交小旅、空空间不断路；访客类型与岔路选择注册后并入账户；英文全程 | 通过 |
| `E2E-LUMI-001..002` | `e2e/tests/space.spec.js` | 16 张类型牌各带灯灵形态；选定类型后小旅凝聚成该形态（空间头部、向导窗口同步）；减少动态效果时直接出现 | 通过 |
| `E2E-ADMIN-FUNNEL-001` | `e2e/tests/space.spec.js` | 后台漏斗面板六个步骤、访客数与比例 | 通过 |
| `E2E-MOBILE-005` | `e2e/tests/mobile.spec.js` | 手机两次点击进入空间，无横向滚动，抽屉菜单有“我的空间” | 通过 |
| `E2E-SCENES-001..002` | `e2e/tests/detail.spec.js` | 详情页按旅程自己的美术数据挂载标志动作、质感、节拍，向下滚动光线弧变化，场景里没有导游式标签；减少动态效果时所有场景立即可读 | 通过 |
| `E2E-SEO-001` | `e2e/tests/detail.spec.js` | robots.txt 有效并指向 sitemap，sitemap 列出每段旅程的分享页 | 通过 |
| `E2E-SHARE-001` | `e2e/tests/detail.spec.js` | /j/:slug 带该旅程的分享标签且只有一组，打开后进入旅程详情，页面标题为旅程名 | 通过 |
| `E2E-DETAIL-001..008` | `e2e/tests/detail.spec.js` | 入口编号、开放时间、身份/章节/岔路/尾声/真实与虚构按 API 渲染，本地化徽章、匹配度 5/5、章节默认可见；岔路选择写入票面并在刷新后保留；返回；分享写入剪贴板；404；访客收藏提示登录；收藏持久化并出现在「我的」；未知路由 404 | 通过 |
| `E2E-AUTH-*` | `e2e/tests/auth.spec.js` | 表单与 label；注册跳转；字段级校验；有效登录；错误密码显示中文提示（旧版为 `HTTP 401`）；验证码错误落在验证码字段；账户菜单 Esc 还原焦点；登出；`?next=` 回跳 | 通过 |
| `E2E-ORDER-001..006` | `e2e/tests/orders.spec.js` | 档位与赠送；赠送到账；页内确认支付；余额不足 → 充值 → 回到订单支付；「我的」中继续支付待支付订单；访客下单引导登录；10 用户顺序注册；出现原生 `confirm/alert` 即失败 | 通过 |
| `E2E-I18N-001..002` | `e2e/tests/i18n.spec.js` | 切换英文后界面与旅程内容均为英文并记住；英文浏览器默认英文，英文搜索命中 | 通过 |
| `E2E-A11Y-*` | `e2e/tests/a11y.spec.js` | 深浅两套主题 × 15 个页面/状态（含三种详情场景）（含类型牌、小旅对话三种状态、你的空间与空状态） axe WCAG 2.1 A/AA 零违规；运行时切换主题后再次扫描对比度并保持焦点；主题切换持久化；跳到正文 | 通过 |
| `E2E-PERSONA-001..002`、`E2E-PET-001..004` | `e2e/tests/persona.spec.js` | 个人页选择 MBTI 保存到账户；从向导窗口进入小旅的六步对话并保存到账户；向导推荐与 Esc 关闭还原焦点；模型回复显示文字与真实旅程链接；没有模型回复或被限流（429）时用本地规则回答且不残留输入中提示 | 通过 |
| `E2E-MOBILE-001..004` | `e2e/tests/mobile.spec.js`（Pixel 7） | 手机菜单有登录/注册；主要页面无横向滚动；筛选面板为底部抽屉；底部预订条下单 | 通过 |

运行：`cd e2e && npx playwright test`（`chromium` 桌面 1440×900 + `mobile` Pixel 7，共 99 个用例）。

### 4.4 Go Stress 矩阵

| ID | 测试函数 | 默认规模 | 目标组合档 | 预期 |
|---|---|---:|---:|---|
| `STRESS-PUBLIC-001` | `TestStressPublicBrowseFlow` | 300 | 3000 | 公开 API 均返回 200 |
| `STRESS-ANALYTICS-001` | `TestStressAnalyticsBufferCapacity` | 20000 | 20000 | flush 后事件数不少于输入数 |
| `STRESS-ORDER-001` | `TestStressOrderPaymentAuditTrail` | 100 users / 500 orders | 同默认 | paid orders 与 purchase transactions 数量等于订单数 |
| `STRESS-ADMIN-001` | `TestStressAdminStatsAndExportAPI` | 100 | 300 | admin stats/export 返回 200 |
| `STRESS-IMAGE-001` | `TestStressStaticImageDelivery` | 300 | 2000 | 静态图返回 200 且有 cache header |

目标组合档命令：

```bash
STRESS_PUBLIC_REQUESTS=3000 \
STRESS_ANALYTICS_EVENTS=20000 \
STRESS_USERS=100 \
STRESS_ORDERS=500 \
STRESS_ADMIN_REQUESTS=300 \
STRESS_IMAGE_REQUESTS=2000 \
go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s
```

### 4.5 k6 负载矩阵

| ID | 脚本 | 覆盖面 | 本轮状态 |
|---|---|---|---|
| `LOAD-K6-PUBLIC-001` | `tests/load/public-content-flow.k6.js` | health、tags、journeys、search、filter、detail | 200 VU / 30s 通过，39193 请求，失败率 0，p95 61.21 ms |
| `LOAD-K6-AUTH-001` | `tests/load/auth-register-login.k6.js` | 验证码、注册、登录 | 40 VU / 30s 通过；120 VU / 30s 功能 100% 通过但 p95 约 2s，阈值失败 |
| `LOAD-K6-ORDER-001` | `tests/load/order-payment-audit.k6.js` | 充值、订单、支付、ledger | 80 VU / 30s 通过，10240 请求，失败率 0，p95 574.66 ms |
| `LOAD-K6-ADMIN-001` | `tests/load/admin-analytics-export.k6.js` | 分析事件、后台 stats、CSV export | 10 VU / 30s 通过；60 VU / 30s 功能 100% 通过但 p95 598.95 ms，阈值失败 |
| `LOAD-K6-PET-001` | `tests/load/pet-chat-analytics.k6.js` | AI pet 并发与 analytics | 200 VU / 30s 通过，12000 请求，失败率 0，p95 8.87 ms |
| `LOAD-K6-IMAGE-001` | `tests/load/image-static-cache.k6.js` | 静态图片吞吐与缓存头 | 300 VU / 30s 通过，9000 请求，失败率 0，p95 17.92 ms |

### 4.6 Nginx 验证矩阵

| ID | 对象 | 命令 | 本轮状态 |
|---|---|---|---|
| `NGINX-SYNTAX-001` | `deploy/nginx.local.conf` 语法 | `nginx -t -c deploy/nginx.local.conf -p .nginx` | 通过 |
| `NGINX-PROXY-001` | `/api/health` 代理 | `curl -fsS http://127.0.0.1:18080/api/health` | 通过，返回 `{"data":{"status":"ok"},"error":null}` |
| `NGINX-STATIC-001` | `/static/assets/` 静态资源 | `curl -I http://127.0.0.1:18080/static/assets/images/generated/hero-taoyuan.jpg` | 通过，`200 OK`，`Content-Length: 451823`，有 cache header |
| `NGINX-STATIC-002` | `/static/css/` 样式资源 | `curl -I http://127.0.0.1:18080/static/css/tokens.css` | 通过，`Content-Type: text/css` |
| `NGINX-STATIC-003` | `/static/js/` 脚本资源 | `curl -I http://127.0.0.1:18080/static/js/router.js` | 通过，`Content-Type: application/javascript` |
| `NGINX-STATIC-004` | 本地默认头像 | `curl -I http://127.0.0.1:18080/static/assets/images/avatars/github-default/avatar-00.svg` | 通过，`Content-Type: image/svg+xml` |
| `NGINX-RATE-001` | API/auth rate limit | k6 高并发脚本 | 已通过 k6 行为验证；生产限速仍需按域名和真实 IP 调整 |

---

## 5. 测试过程

### 5.1 常规回归过程

1. 确认只修改目标范围文件。
2. 运行 Go 单元与集成回归：

   ```bash
   go test ./...
   ```

3. 运行 Go 静态检查：

   ```bash
   go vet ./...
   ```

4. 运行前端 JS 语法检查：

   ```bash
   find web/js -name '*.js' -exec node --check {} \;
   ```

5. 需要刷新浏览器证据时运行：

   ```bash
   cd e2e
   npx playwright test
   ```

6. 需要刷新容量证据时运行 Go stress、k6、Nginx 检查，并把结果写入测试结果表。

### 5.2 结果记录规则

- 通过：必须写明本轮执行命令、退出码、关键输出。
- 未执行：必须写明未执行原因，例如工具未安装、服务未启动、超出当前写入范围。
- 失败：必须保留错误摘要，并进入异常/风险记录。
- 历史证据：只能作为参考，不能覆盖本轮状态。

---

## 6. 本轮测试结果与日志

| ID | 命令 | 本轮结果 | 备注 |
|---|---|---|---|
| `LOG-GO-TEST-20260514` | `go test ./...` | 通过 | 管理员统计契约修复后已最终复跑 |
| `LOG-GO-VET-20260514` | `go vet ./...` | 通过 | 退出码 0，无错误输出 |
| `LOG-JS-CHECK-20260514` | `find web/js -name '*.js' -exec node --check {} \;` | 通过 | 无语法错误输出 |
| `LOG-STRESS-20260514` | 目标组合档 Go stress 命令 | 通过 | 输出 `ok github.com/100-journeys/app/tests/stress 1.660s` |
| `LOG-K6-20260514` | `tests/load/*.k6.js` | 已执行 | 详见 `docs/ops/LOAD_TEST_RESULTS.md` |
| `LOG-NGINX-20260514` | `nginx -t`、health curl、图片 HEAD | 已执行 | 详见 `docs/ops/LOAD_TEST_RESULTS.md` |
| `LOG-PLAYWRIGHT-20260514` | `cd e2e && npx playwright test` | 通过 | 29/29，覆盖 captcha-aware 注册登录、充值、下单支付、订单和流水 |
| `LOG-DOC-GEN-20260514` | `python3 scripts/docs/generate_project_artifacts.py` | 通过 | 已生成 `docs/generated/*` |

### 6.1 历史证据，仅供参考

上一会话已知证据可在报告中标注为历史证据：

- `go test ./...` 通过。
- `go vet ./...` 通过。
- JS `node --check` 通过。
- handler 测试中 50 个虚拟用户和 admin 注入防护通过。
- medium profile stress 曾通过，记录时间为 `15.271s`。
- 当时 `k6` 未执行。
- 上一会话 Playwright 仍待刷新；当前已于 2026-05-14 刷新并通过 29/29。
- 当时 Nginx 未验证。

---

## 7. 异常与风险记录

| ID | 类型 | 现象 | 影响 | 处理要求 |
|---|---|---|---|---|
| `RISK-K6-001` | 容量边界 | `auth` 120 VU 与 `admin` 60 VU 功能正确但 p95 超阈值 | 高并发写入和后台导出不应被描述为无限生产级 | 保留 k6 结果，生产限制后台导出频率，必要时迁移统计到异步快照 |
| `RISK-NGINX-001` | 生产差异 | 本轮验证为本地 HTTP Nginx，腾讯云公网演示也为 HTTP IP | 本地通过不等于正式 HTTPS 域名完成 | 备案完成后使用 Let's Encrypt 或等价证书并复跑 smoke |
| `RISK-E2E-001` | 已关闭 | `cd e2e && npx playwright test` 已通过，29/29 | 当前前端全链路已刷新 | 生产部署后仍需按域名重跑 smoke |
| `RISK-STATIC-001` | 架构风险 | Go 直出静态图历史上有瓶颈；Nginx 300 VU/30s 已通过 | 生产仍应走 Nginx/CDN/对象存储 | 保持 `/static/assets/` Nginx alias，后续可迁移 CDN/对象存储 |
| `RISK-CICD-001` | CI/CD 缺口 | 原仓库只有 GitHub Pages workflow | 不足以证明全栈 DevOps | 已新增 `.github/workflows/ci.yml`，本地仍需最终复跑 |

---

## 8. 准入与退出标准

### 8.1 当前分支回归准入

- `go test ./...` 通过。
- `go vet ./...` 通过。
- `find web/js -name '*.js' -exec node --check {} \;` 通过。
- 测试文档明确记录未执行项，不伪造通过。

### 8.2 生产就绪退出标准

- Go 单元、集成、stress 目标组合档全部通过。
- Playwright E2E 全量刷新通过。
- k6 六个脚本至少在本地 smoke 和目标环境各执行一次，并保留结果。
- Nginx 语法、代理健康检查、静态资源缓存头和限流策略验证通过。
- 对任何失败或容量瓶颈，必须有异常记录、影响说明和降级/修复方案。
