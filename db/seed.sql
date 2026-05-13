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
),
(
  '挪威特罗姆瑟极光狩猎',
  'norway-aurora-hunt',
  '在零下二十度的黑夜里，等一束来自太阳的光',
  '在零下二十度的黑夜里，等一束来自太阳的光',
  '特罗姆瑟的冬天没有白天，只有漫长的蓝调和黑夜。你裹着三层羽绒服躺在雪地上，脖子仰成九十度，等待那道绿色的帷幕从地平线缓缓升起。当极光真正爆发时，整个天空都在跳舞——你会忘记寒冷，忘记时间，甚至忘记自己是谁。',
  '欧洲 · 挪威',
  'night',
  'dramatic',
  6,
  5,
  3,
  '["极光","寒冷","等待","爆发","夜空"]',
  'norway-aurora.jpg',
  NULL,
  18999
),
(
  '新西兰米尔福德峡湾皮划艇',
  'new-zealand-milford-kayak',
  '在两千米高的瀑布下，你渺小得像一滴水',
  '在两千米高的瀑布下，你渺小得像一滴水',
  '米尔福德峡湾的峭壁从水面直接拔起两千米，岩壁上挂满了临时瀑布——前一秒还是晴天，下一秒暴雨就让几百条银线同时坠入海中。你划着皮划艇靠近其中一条，水雾打在脸上，分不清是雨水、海水还是瀑布的水。',
  '大洋洲 · 新西兰',
  'extreme',
  'raw',
  8,
  6,
  4,
  '["瀑布","皮划艇","水雾","渺小","暴雨"]',
  'new-zealand-milford.jpg',
  NULL,
  22999
),
(
  '巴塔哥尼亚百内国家公园徒步',
  'patagonia-torres-del-paine-trek',
  '狂风把云撕碎，露出花岗岩的尖顶',
  '狂风把云撕碎，露出花岗岩的尖顶',
  '百内国家公园的天气变化比心跳还快。前一秒狂风暴雨，下一秒阳光就把三塔峰照成金色。你背着四十升的包在碎石坡上艰难前行，每一步都在和地心引力谈判。但当W线走完的那一刻，你明白了为什么有人愿意飞三十个小时来受这个罪。',
  '南美洲 · 智利',
  'extreme',
  'dramatic',
  9,
  7,
  4,
  '["狂风","徒步","花岗岩","三塔峰","挑战"]',
  'patagonia-torres-del-paine.jpg',
  NULL,
  24999
),
(
  '土耳其卡帕多西亚热气球日出',
  'turkey-cappadocia-balloon',
  '一百个热气球同时升空，你漂浮在月球表面',
  '一百个热气球同时升空，你漂浮在月球表面',
  '凌晨四点半，卡帕多西亚的峡谷还笼罩在蓝调中。火焰喷射器间歇性轰鸣，巨大的彩色球体一个接一个挣脱地心引力。当太阳从地平线跃出，把整个峡谷染成玫瑰金色，你低头看着那些精灵烟囱和洞穴教堂——这是人类最接近飞行梦想的时刻。',
  '亚洲 · 土耳其',
  'visual',
  'surreal',
  5,
  4,
  2,
  '["热气球","日出","月球","玫瑰金","飞行"]',
  'turkey-cappadocia.jpg',
  NULL,
  16999
),
(
  '秘鲁马丘比丘印加古道徒步',
  'peru-machu-picchu-inca-trail',
  '四天三夜，走在五百年前铺好的石阶上',
  '四天三夜，走在五百年前铺好的石阶上',
  '印加古道不是观光路线，是一次时间旅行。你踩着五百年前印加工匠凿出来的石阶，穿过云雾森林，越过海拔四千二百米的死亡女峰。第四天凌晨，当浓雾突然散开，马丘比丘的轮廓出现在你面前——那一刻，所有的肌肉酸痛都变成了值得。',
  '南美洲 · 秘鲁',
  'culture',
  'minimal',
  8,
  8,
  4,
  '["古道","印加","石阶","云雾","时间"]',
  'peru-machu-picchu.jpg',
  NULL,
  21999
),
(
  '纳米比亚死亡谷星空露营',
  'namibia-deadvlei-stars',
  '九百年的枯树站在红沙丘上，像大地竖起的图腾',
  '九百年的枯树站在红沙丘上，像大地竖起的图腾',
  '死亡谷不是真的死亡——它只是不再下雨。九百年前枯死的骆驼刺树依然站立在龟裂的白色盐沼上，背景是世界上最高的红沙丘。夜晚在附近扎营，没有月亮，银河从沙丘顶端倾泻而下，那些枯树的剪影在星光下像某种远古的仪式现场。',
  '非洲 · 纳米比亚',
  'night',
  'surreal',
  7,
  9,
  3,
  '["枯树","红沙丘","银河","盐沼","远古"]',
  'namibia-deadvlei.jpg',
  NULL,
  19999
),
(
  '马尔代夫海底餐厅晚宴',
  'maldives-underwater-dining',
  '在五米深的海底，和鲨鱼一起享用香槟',
  '在五米深的海底，和鲨鱼一起享用香槟',
  '马尔代夫康拉德酒店的海底餐厅Ithaa，是一个全透明的丙烯酸穹顶。你坐在海底五米处，脚下是白沙和珊瑚，头顶是游过的蝠鲼和礁鲨。侍者端上香槟的那一刻，一条护士鲨恰好从窗外掠过——这是地球上最浪漫的晚餐，没有之一。',
  '亚洲 · 马尔代夫',
  'visual',
  'surreal',
  3,
  5,
  1,
  '["海底","鲨鱼","香槟","穹顶","浪漫"]',
  'maldives-underwater.jpg',
  NULL,
  35999
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

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'norway-aurora-hunt'         AND t.slug IN ('night','visual','nature');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'new-zealand-milford-kayak'  AND t.slug IN ('extreme','nature','visual');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'patagonia-torres-del-paine-trek' AND t.slug IN ('extreme','nature','hidden');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'turkey-cappadocia-balloon'  AND t.slug IN ('visual','culture','night');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'peru-machu-picchu-inca-trail' AND t.slug IN ('culture','extreme','hidden');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'namibia-deadvlei-stars'     AND t.slug IN ('night','visual','nature');

INSERT OR IGNORE INTO journey_tags (journey_id, tag_id)
SELECT j.id, t.id FROM journeys j, tags t
WHERE j.slug = 'maldives-underwater-dining' AND t.slug IN ('visual','culture','hidden');

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

-- Norway aurora: INFJ ★★★★★, INFP ★★★★★, ISFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'norway-aurora-hunt' AND m.code IN ('INFJ','INFP');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'norway-aurora-hunt' AND m.code = 'ISFJ';

-- NZ milford: ESTP ★★★★★, ISTP ★★★★★, ENTP ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'new-zealand-milford-kayak' AND m.code IN ('ESTP','ISTP');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'new-zealand-milford-kayak' AND m.code = 'ENTP';

-- Patagonia: ENTJ ★★★★★, INTJ ★★★★★, ISTJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'patagonia-torres-del-paine-trek' AND m.code IN ('ENTJ','INTJ');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'patagonia-torres-del-paine-trek' AND m.code = 'ISTJ';

-- Turkey balloon: ESFP ★★★★★, ENFP ★★★★★, ISFP ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'turkey-cappadocia-balloon' AND m.code IN ('ESFP','ENFP');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'turkey-cappadocia-balloon' AND m.code = 'ISFP';

-- Peru machu picchu: ISFJ ★★★★★, ISTJ ★★★★★, INFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'peru-machu-picchu-inca-trail' AND m.code IN ('ISFJ','ISTJ');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'peru-machu-picchu-inca-trail' AND m.code = 'INFJ';

-- Namibia deadvlei: INFP ★★★★★, INFJ ★★★★★, INTJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'namibia-deadvlei-stars' AND m.code IN ('INFP','INFJ');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'namibia-deadvlei-stars' AND m.code = 'INTJ';

-- Maldives underwater: ESFJ ★★★★★, ENFJ ★★★★★, ISFJ ★★★★☆
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 5 FROM journeys j, mbti_types m
WHERE j.slug = 'maldives-underwater-dining' AND m.code IN ('ESFJ','ENFJ');
INSERT OR IGNORE INTO journey_mbti (journey_id, mbti_id, compatibility_score)
SELECT j.id, m.id, 4 FROM journeys j, mbti_types m
WHERE j.slug = 'maldives-underwater-dining' AND m.code = 'ISFJ';
