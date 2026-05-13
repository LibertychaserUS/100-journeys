# 样例旅程数据逐条清单 / Seed Journey Data

> 来源：脚本临时加载 `db/schema.sql` 与 `db/seed.sql` 到 SQLite 后导出；不是手写摘要。

当前 `db/seed.sql` 共初始化 12 条高质量旅程样例，满足“至少 5 条高质量样例数据”要求。

| # | slug | 标题 | 地区 | 类型 | 风格 | 冒险/小众/风险 | 价格 | 图片 | 标签 | MBTI 匹配 |
|---:|---|---|---|---|---|---|---:|---|---|---|
| 1 | `bolivia-salt-flat-trek` | 徒步穿越玻利维亚盐沼 | 南美洲 · 玻利维亚 | solitude | surreal | 7/8/3 | 15999 | `bolivia-salt-flat.jpg` | solitude;visual;hidden | INFP:5;ISFJ:4;INFJ:4 |
| 2 | `iceland-lava-tunnel-cycling` | 冰岛熔岩隧道骑行 | 欧洲 · 冰岛 | extreme | dramatic | 9/9/4 | 19999 | `iceland-lava-tunnel.jpg` | extreme;hidden;nature | INTJ:5;ENTP:4;ISTP:4 |
| 3 | `japan-onsen-temple-meditation` | 日本秘境温泉寺庙冥想 | 亚洲 · 日本 | spiritual | minimal | 4/7/2 | 8999 | `japan-temple-onsen.jpg` | solitude;culture;spiritual | INFP:5;ISFJ:5;INFJ:4 |
| 4 | `morocco-sahara-camel-camp` | 摩洛哥撒哈拉沙漠骆驼夜宿 | 非洲 · 摩洛哥 | night | dramatic | 6/6/3 | 12999 | `morocco-sahara-camp.jpg` | visual;nature;night | ENFP:5;ESFP:4;ENFJ:4 |
| 5 | `greenland-dog-sled-solo` | 格陵兰犬拉雪橇独行 | 北极 · 格陵兰 | extreme | raw | 10/10/5 | 29999 | `greenland-dog-sled.jpg` | extreme;solitude;nature | ESTP:5;ENTJ:4;ISTP:4 |
| 6 | `norway-aurora-hunt` | 挪威特罗姆瑟极光狩猎 | 欧洲 · 挪威 | night | dramatic | 6/5/3 | 18999 | `norway-aurora.jpg` | visual;nature;night | INFP:5;ISFJ:4;INFJ:5 |
| 7 | `new-zealand-milford-kayak` | 新西兰米尔福德峡湾皮划艇 | 大洋洲 · 新西兰 | extreme | raw | 8/6/4 | 22999 | `new-zealand-milford.jpg` | extreme;visual;nature | ENTP:4;ESTP:5;ISTP:5 |
| 8 | `patagonia-torres-del-paine-trek` | 巴塔哥尼亚百内国家公园徒步 | 南美洲 · 智利 | extreme | dramatic | 9/7/4 | 24999 | `patagonia-torres-del-paine.jpg` | extreme;hidden;nature | INTJ:5;ISTJ:4;ENTJ:5 |
| 9 | `turkey-cappadocia-balloon` | 土耳其卡帕多西亚热气球日出 | 亚洲 · 土耳其 | visual | surreal | 5/4/2 | 16999 | `turkey-cappadocia.jpg` | visual;culture;night | ENFP:5;ISFP:4;ESFP:5 |
| 10 | `peru-machu-picchu-inca-trail` | 秘鲁马丘比丘印加古道徒步 | 南美洲 · 秘鲁 | culture | minimal | 8/8/4 | 21999 | `peru-machu-picchu.jpg` | extreme;culture;hidden | ISFJ:5;ISTJ:5;INFJ:4 |
| 11 | `namibia-deadvlei-stars` | 纳米比亚死亡谷星空露营 | 非洲 · 纳米比亚 | night | surreal | 7/9/3 | 19999 | `namibia-deadvlei.jpg` | visual;nature;night | INFP:5;INTJ:4;INFJ:5 |
| 12 | `maldives-underwater-dining` | 马尔代夫海底餐厅晚宴 | 亚洲 · 马尔代夫 | visual | surreal | 3/5/1 | 35999 | `maldives-underwater.jpg` | visual;culture;hidden | ISFJ:4;ESFJ:5;ENFJ:5 |

## 字段说明

- `slug`：旅程唯一业务标识，用于详情页路由和订单快照。
- `price`：WonderCoin 模拟价格，和真实高端旅行费用大致对齐。
- `image_path`：本地优先静态图路径；生产可由 Nginx/CDN/R2 等承接。
- `tags`：与 `journey_tags` 关联的分类标签。
- `mbti`：与 `journey_mbti` 关联的 MBTI 代码和 1-5 匹配分。
