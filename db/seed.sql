-- =============================================================
-- seed.sql — 5 high-quality sample journeys v1.1
-- Adds: story_hook, fantasy_type, risk_level, mood_keywords, booking_url
-- Adds: MBTI types + journey_mbti associations
-- =============================================================

-- Tags
INSERT OR IGNORE INTO tags (name, slug) VALUES
  ('极限挑战',   'extreme'),
  ('孤独感',     'solitude'),
  ('视觉奇观',   'visual'),
  ('文化沉浸',   'culture'),
  ('隐秘小众',   'hidden'),
  ('自然原始',   'nature'),
  ('精神体验',   'spiritual'),
  ('夜晚魔法',   'night');

-- MBTI Types (16 personalities)
INSERT OR IGNORE INTO mbti_types (code, name, description, color) VALUES
  ('INFP', '调停者', '理想主义的旅行家，追求意义和内在体验', '#6b4fa0'),
  ('INTJ', '建筑师', '策略型探索者，偏爱计划和深度', '#4a7fa0'),
  ('ENFP', '竞选者', '充满热情的冒险家，渴望新鲜体验', '#a07040'),
  ('ISFJ', '守护者', '细致体贴的旅行者，注重安全和舒适', '#40a070'),
  ('ENTP', '辩论家', '好奇的发明家，喜欢挑战和辩论', '#a04070'),
  ('ISTJ', '物流师', '务实的组织者，偏爱结构化的行程', '#4070a0'),
  ('INFJ', '提倡者', '安静的理想主义者，寻求深层连接', '#7040a0'),
  ('ESTP', '企业家', '活力四射的实干家，活在当下', '#a0a040'),
  ('ISFP', '探险家', '灵活的艺术家，享受当下感官体验', '#40a070'),
  ('ENTJ', '指挥官', '果断的领导者，追求效率和目标', '#7040a0'),
  ('ESTJ', '总经理', '务实的管理者，重视传统和秩序', '#4070a0'),
  ('ESFP', '表演者', '自发的表演者，热爱社交和乐趣', '#a07040'),
  ('ESFJ', '执政官', '热心的合作者，关注和谐和关怀', '#40a070'),
  ('INTP', '逻辑学家', '好奇的分析师，追求知识和创新', '#4a7fa0'),
  ('ENFJ', '主人公', '魅力的激励者，关注他人成长', '#a04070'),
  ('ISTP', '鉴赏家', '冷静的实验者，擅长动手和观察', '#707070');

-- Journeys
INSERT OR IGNORE INTO journeys
  (title, slug, subtitle, story_hook, story, region, fantasy_type, visual_style, adventure_index, obscurity_level, risk_level, mood_keywords, image_path, booking_url, price)
VALUES
(
  '徒步穿越玻利维亚盐沼',
  'bolivia-salt-flat-trek',
  '世界尽头的镜面，你踩碎了天空',
  '你踩碎了天空，世界失去了边界',
  '当雨季薄水覆盖乌尤尼盐沼，整个世界失去了边界。你踩着半厘米深的水，脚下是天空，头上也是天空。没有地平线，没有方向感，只有绵延至无穷远的白色寂静。这不是旅行，这是一次关于孤独和无限的哲学实验。',
  '南美洲 · 玻利维亚',
  'solitude',
  'surreal',
  7,
  8,
  3,
  '["孤独","无限感","镜面世界","极简主义"]',
  'bolivia-salt-flat.jpg',
  NULL,
  15999
),
(
  '冰岛熔岩隧道骑行',
  'iceland-lava-tunnel-cycling',
  '地球内部有一条路，只有你知道',
  '地球内部有一条路，只有你知道',
  '斯奈山半岛深处，一条形成于三千年前的熔岩隧道蜿蜒数公里。没有游客，没有指示牌，只有你的头灯照亮的玄武岩壁和远处永恒的黑暗。每次踩踏，回声在洞穴里反复叠加，像是地球本身在对你低语。',
  '欧洲 · 冰岛',
  'extreme',
  'dramatic',
  9,
  9,
  4,
  '["黑暗","回声","原始","恐惧","自由"]',
  'iceland-lava-tunnel.jpg',
  NULL,
  19999
),
(
  '日本秘境温泉寺庙冥想',
  'japan-onsen-temple-meditation',
  '凌晨三点，只有蒸汽和沉默',
  '凌晨三点，只有蒸汽和沉默',
  '和歌山山中的某座小寺，接受在家居士入住。凌晨三点随僧侣起床，在黑暗中徒步至山顶，看第一缕日光穿透云海。之后是两小时的无声冥想，浸泡在寺院后山的天然温泉里，感受水温与思绪同时冷却。',
  '亚洲 · 日本',
  'spiritual',
  'minimal',
  4,
  7,
  2,
  '["冥想","沉默","蒸汽","冷却","纯净"]',
  'japan-temple-onsen.jpg',
  NULL,
  8999
),
(
  '摩洛哥撒哈拉沙漠骆驼夜宿',
  'morocco-sahara-camel-camp',
  '没有光污染的天空，让人害怕的辽阔',
  '没有光污染的天空，让人害怕的辽阔',
  '梅尔祖卡的沙丘没有截止时间。骑着骆驼进入沙漠腹地三小时，在一个没有任何人工光源的地方支起帐篷。当银河从地平线一端铺至另一端，你突然理解了古代游牧民为何相信神住在天上——那里比地面上任何地方都更像一个家。',
  '非洲 · 摩洛哥',
  'night',
  'dramatic',
  6,
  6,
  3,
  '["星空","辽阔","游牧","银河","夜晚"]',
  'morocco-sahara-camp.jpg',
  NULL,
  12999
),
(
  '格陵兰犬拉雪橇独行',
  'greenland-dog-sled-solo',
  '零下三十度，全世界只有你和十二条狗',
  '零下三十度，全世界只有你和十二条狗',
  '伊卢利萨特冰峡湾的狗拉雪橇不是表演，是唯一的交通方式。向导把缰绳递给你，就回去喝咖啡了。在白茫茫的冰盖上，你必须学会用眼神和吼声指挥犬队，因为迷路在这里的代价是真实的。恐惧和自由在同一个瞬间到来。',
  '北极 · 格陵兰',
  'extreme',
  'raw',
  10,
  10,
  5,
  '["极寒","孤独","犬队","生存","北极"]',
  'greenland-dog-sled.jpg',
  NULL,
  29999
);

-- Attach tags to journeys
INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'bolivia-salt-flat-trek'     AND t.slug IN ('solitude','visual','hidden');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'iceland-lava-tunnel-cycling' AND t.slug IN ('extreme','hidden','nature');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'japan-onsen-temple-meditation' AND t.slug IN ('spiritual','culture','solitude');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'morocco-sahara-camel-camp'  AND t.slug IN ('night','visual','nature');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'greenland-dog-sled-solo'    AND t.slug IN ('extreme','solitude','nature');

-- Attach MBTI compatibilities to journeys
-- Bolivia salt flat: INFP ★★★★★, ISFJ ★★★★☆, INFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'bolivia-salt-flat-trek' AND m.code = 'INFP';
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'bolivia-salt-flat-trek' AND m.code IN ('ISFJ','INFJ');

-- Iceland lava tunnel: INTJ ★★★★★, ISTP ★★★★☆, ENTP ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'iceland-lava-tunnel-cycling' AND m.code = 'INTJ';
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'iceland-lava-tunnel-cycling' AND m.code IN ('ISTP','ENTP');

-- Japan temple: ISFJ ★★★★★, INFP ★★★★★, INFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'japan-onsen-temple-meditation' AND m.code IN ('ISFJ','INFP');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'japan-onsen-temple-meditation' AND m.code = 'INFJ';

-- Morocco desert: ENFP ★★★★★, ESFP ★★★★☆, ENFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'morocco-sahara-camel-camp' AND m.code = 'ENFP';
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'morocco-sahara-camel-camp' AND m.code IN ('ESFP','ENFJ');

-- Greenland dog sled: ESTP ★★★★★, ENTJ ★★★★☆, ISTP ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'greenland-dog-sled-solo' AND m.code = 'ESTP';
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'greenland-dog-sled-solo' AND m.code IN ('ENTJ','ISTP');
