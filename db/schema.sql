-- =============================================================
-- schema.sql — Database schema
-- SDD Phase artifact — aligns with ISO/IEC/IEEE 29148:2018
-- =============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Core content table
CREATE TABLE IF NOT EXISTS journeys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    slug            TEXT    NOT NULL UNIQUE,
    subtitle        TEXT,
    story           TEXT,                    -- long-form narrative
    region          TEXT,
    visual_style    TEXT    NOT NULL DEFAULT 'raw',  -- 'raw'|'surreal'|'minimal'|'dramatic'
    adventure_index INTEGER NOT NULL DEFAULT 5 CHECK(adventure_index BETWEEN 1 AND 10),
    obscurity_level INTEGER NOT NULL DEFAULT 5 CHECK(obscurity_level BETWEEN 1 AND 10),
    image_path      TEXT,                    -- local path OR CDN key
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Predefined tags (normalized, avoids JSON LIKE queries)
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

-- Indexes for filter performance
CREATE INDEX IF NOT EXISTS idx_journeys_visual_style    ON journeys(visual_style);
CREATE INDEX IF NOT EXISTS idx_journeys_adventure_index ON journeys(adventure_index);
CREATE INDEX IF NOT EXISTS idx_journeys_obscurity_level ON journeys(obscurity_level);
CREATE INDEX IF NOT EXISTS idx_journey_tags_tag_id      ON journey_tags(tag_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_journeys_updated_at
    AFTER UPDATE ON journeys
    FOR EACH ROW
BEGIN
    UPDATE journeys SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
