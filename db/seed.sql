-- =============================================================
-- seed.sql — 5 high-quality sample journeys
-- =============================================================

INSERT OR IGNORE INTO tags (name, slug) VALUES
  ('极限挑战',   'extreme'),
  ('孤独感',     'solitude'),
  ('视觉奇观',   'visual'),
  ('文化沉浸',   'culture'),
  ('隐秘小众',   'hidden'),
  ('自然原始',   'nature'),
  ('精神体验',   'spiritual'),
  ('夜晚魔法',   'night');

INSERT OR IGNORE INTO journeys (title, slug, subtitle, story, region, visual_style, adventure_index, obscurity_level, image_path) VALUES
(
  '徒步穿越玻利维亚盐沼',
  'bolivia-salt-flat-trek',
  '世界尽头的镜面，你踩碎了天空',
  '当雨季薄水覆盖乌尤尼盐沼，整个世界失去了边界。你踩着半厘米深的水，脚下是天空，头上也是天空。没有地平线，没有方向感，只有绵延至无穷远的白色寂静。这不是旅行，这是一次关于孤独和无限的哲学实验。',
  '南美洲 · 玻利维亚',
  'surreal',
  7,
  8,
  'bolivia-salt-flat.jpg'
),
(
  '冰岛熔岩隧道骑行',
  'iceland-lava-tunnel-cycling',
  '地球内部有一条路，只有你知道',
  '斯奈山半岛深处，一条形成于三千年前的熔岩隧道蜿蜒数公里。没有游客，没有指示牌，只有你的头灯照亮的玄武岩壁和远处永恒的黑暗。每次踩踏，回声在洞穴里反复叠加，像是地球本身在对你低语。',
  '欧洲 · 冰岛',
  'dramatic',
  9,
  9,
  'iceland-lava-tunnel.jpg'
),
(
  '日本秘境温泉寺庙冥想',
  'japan-onsen-temple-meditation',
  '凌晨三点，只有蒸汽和沉默',
  '和歌山山中的某座小寺，接受在家居士入住。凌晨三点随僧侣起床，在黑暗中徒步至山顶，看第一缕日光穿透云海。之后是两小时的无声冥想，浸泡在寺院后山的天然温泉里，感受水温与思绪同时冷却。',
  '亚洲 · 日本',
  'minimal',
  4,
  7,
  'japan-temple-onsen.jpg'
),
(
  '摩洛哥撒哈拉沙漠骆驼夜宿',
  'morocco-sahara-camel-camp',
  '没有光污染的天空，让人害怕的辽阔',
  '梅尔祖卡的沙丘没有截止时间。骑着骆驼进入沙漠腹地三小时，在一个没有任何人工光源的地方支起帐篷。当银河从地平线一端铺至另一端，你突然理解了古代游牧民为何相信神住在天上——那里比地面上任何地方都更像一个家。',
  '非洲 · 摩洛哥',
  'dramatic',
  6,
  6,
  'morocco-sahara-camp.jpg'
),
(
  '格陵兰犬拉雪橇独行',
  'greenland-dog-sled-solo',
  '零下三十度，全世界只有你和十二条狗',
  '伊卢利萨特冰峡湾的狗拉雪橇不是表演，是唯一的交通方式。向导把缰绳递给你，就回去喝咖啡了。在白茫茫的冰盖上，你必须学会用眼神和吼声指挥犬队，因为迷路在这里的代价是真实的。恐惧和自由在同一个瞬间到来。',
  '北极 · 格陵兰',
  'raw',
  10,
  10,
  'greenland-dog-sled.jpg'
);

-- Attach tags to journeys
INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'bolivia-salt-flat-trek'     AND t.slug IN ('孤独感','视觉奇观','隐秘小众');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'iceland-lava-tunnel-cycling' AND t.slug IN ('极限挑战','隐秘小众','自然原始');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'japan-onsen-temple-meditation' AND t.slug IN ('精神体验','文化沉浸','孤独感');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'morocco-sahara-camel-camp'  AND t.slug IN ('夜晚魔法','视觉奇观','自然原始');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'greenland-dog-sled-solo'    AND t.slug IN ('极限挑战','孤独感','自然原始');
