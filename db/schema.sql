-- =============================================================
-- schema.sql — Database schema v1.1
-- SDD Phase artifact — ISO/IEC/IEEE 29148:2018
-- Adds: story_hook, fantasy_type, risk_level, mood_keywords, booking_url
-- Adds: mbti_types, journey_mbti tables
-- =============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Core content table
CREATE TABLE IF NOT EXISTS journeys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    slug            TEXT    NOT NULL UNIQUE,
    subtitle        TEXT,
    story_hook      TEXT    NOT NULL DEFAULT '',        -- one-sentence emotional hook
    story           TEXT,                                 -- long-form narrative
    region          TEXT,
    fantasy_type    TEXT    NOT NULL DEFAULT 'visual',   -- 'extreme'|'solitude'|'visual'|'culture'|'spiritual'|'night'
    visual_style    TEXT    NOT NULL DEFAULT 'raw',       -- 'raw'|'surreal'|'minimal'|'dramatic'
    adventure_index INTEGER NOT NULL DEFAULT 5 CHECK(adventure_index BETWEEN 1 AND 10),
    obscurity_level INTEGER NOT NULL DEFAULT 5 CHECK(obscurity_level BETWEEN 1 AND 10),
    risk_level      INTEGER NOT NULL DEFAULT 3 CHECK(risk_level BETWEEN 1 AND 5),
    mood_keywords   TEXT,                                 -- JSON array: ["孤独","无限感"]
    image_path      TEXT,                                 -- local path OR CDN key
    booking_url     TEXT,                                 -- nullable, future booking partner
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Predefined tags (travel type taxonomy)
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

-- Many-to-many: journeys <-> tags
CREATE TABLE IF NOT EXISTS journey_tags (
    journey_id INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
    PRIMARY KEY (journey_id, tag_id)
);

-- MBTI types (16 fixed personalities)
CREATE TABLE IF NOT EXISTS mbti_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,       -- 'INFP', 'INTJ', etc.
    name        TEXT    NOT NULL,              -- full name
    description TEXT,                          -- travel personality description
    color       TEXT    NOT NULL DEFAULT '#6b4fa0'
);

-- Many-to-many: journeys <-> mbti with compatibility score
CREATE TABLE IF NOT EXISTS journey_mbti (
    journey_id          INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    mbti_id             INTEGER NOT NULL REFERENCES mbti_types(id) ON DELETE CASCADE,
    compatibility_score INTEGER NOT NULL DEFAULT 3 CHECK(compatibility_score BETWEEN 1 AND 5),
    PRIMARY KEY (journey_id, mbti_id)
);

-- AI conversation log (for analytics, optional)
CREATE TABLE IF NOT EXISTS ai_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('user','assistant')),
    content    TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for filter performance
CREATE INDEX IF NOT EXISTS idx_journeys_fantasy_type    ON journeys(fantasy_type);
CREATE INDEX IF NOT EXISTS idx_journeys_visual_style    ON journeys(visual_style);
CREATE INDEX IF NOT EXISTS idx_journeys_adventure_index ON journeys(adventure_index);
CREATE INDEX IF NOT EXISTS idx_journeys_obscurity_level ON journeys(obscurity_level);
CREATE INDEX IF NOT EXISTS idx_journeys_risk_level      ON journeys(risk_level);
CREATE INDEX IF NOT EXISTS idx_journey_tags_tag_id      ON journey_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_journey_mbti_mbti_id     ON journey_mbti(mbti_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_journeys_updated_at
    AFTER UPDATE ON journeys
    FOR EACH ROW
BEGIN
    UPDATE journeys SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
