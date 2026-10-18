# 产品概览 · 桃源百旅 / 100 Journeys

## 定位

《桃花源记》里，渔人出来时处处做了记号，回头再找却再也找不到路。桃源百旅的设定是：入口没有消失，而是散落在真实世界的某个季节、某个时辰里。产品把一百段旅行写成一百个“入口”，用户不是从地图上挑目的地，而是从一种心情、一个 MBTI 人格或一类幻想世界出发，读一段带有临时身份、任务和线索的旅行剧本，再用虚拟币领取它。

English: 100 Journeys turns travel inspiration into a hundred "entrances" hidden in real places, seasons and hours. You arrive with a mood or a personality, read a short travel script (a role, a mission, a few clues) and claim it with a simulated wallet.

## 用户

| 用户 | 想要的 |
|---|---|
| 想换一种生活一天的人 | 一句话就被击中的旅行灵感，而不是攻略 |
| 小众与深度旅行者 | 不在热门清单上的地方，和真实可信的细节 |
| 沉浸式内容爱好者 | 像进入一个剧本一样进入一段旅程 |
| 管理员 | 看到真实的浏览、购买和人格分布数据 |

## 核心体验

```text
到达 → 选一种心情 / 人格 / 幻想类型
     → 探索入口（筛选、搜索、可分享的链接）
     → 读剧本：临时身份、任务、章节、线索
     → 收藏，或用不思议币领取（页内确认、余额不足可补差额后回到订单）
     → 在「我的」里查看订单、收藏、交易记录和旅行人格
```

## 已实现能力

- 中英双语界面与内容（`?lang=en`），深浅两套主题，WCAG AA 对比度。
- 探索：幻想类型、MBTI、冒险强度、标签、视觉风格筛选与关键词搜索。
- 详情：海报式头图、三章剧本、旅行剧本票（预订卡）、手机底部预订条。
- 账户：验证码注册登录、头像、收藏、旅行人格（MBTI）保存。
- 钱包：档位充值（赠送实际入账）、积分折扣、订单与流水。
- 向导：规则引擎的旅行向导与 5 题人格测验。
- 后台：实时指标、热门与畅销旅程、人格与性别分布、审计计数、CSV 导出。

## 不做的事

- 不接真实支付、预订或第三方商业服务；订单、积分和不思议币都是模拟的。
- 不承诺中国大陆访问速度；正式国内域名需要 ICP 备案。

## 相关文档

- 设计系统与页面行为：[ui-components/DDD-spec.md](ui-components/DDD-spec.md)
- 需求与数据：[schema/SDD-spec.md](schema/SDD-spec.md)
- 接口：[schema/api-contract.md](schema/api-contract.md)
- 测试：[testing/TDD-spec.md](testing/TDD-spec.md)
- 部署与运维：[ops/](ops/)
