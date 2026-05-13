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
    price           INTEGER NOT NULL DEFAULT 0,           -- simulated price in 不思议币 (smallest unit, integer only)
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

-- =============================================================
-- User system (v1.1.0)
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    level           INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 10),
    points          INTEGER NOT NULL DEFAULT 0,
    balance         INTEGER NOT NULL DEFAULT 0,           -- 不思议币 balance (smallest unit, integer only)
    mbti_type       TEXT,
    gender          TEXT    NOT NULL DEFAULT 'prefer_not_to_say' CHECK(gender IN ('female','male','non_binary','prefer_not_to_say')),
    avatar_url      TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_points_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type     TEXT    NOT NULL,   -- 'register','login','explore','save','share','review'
    points_delta    INTEGER NOT NULL,
    balance_after   INTEGER NOT NULL,
    description     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_saved_journeys (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    journey_id  INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, journey_id)
);

CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username     ON users(username);
CREATE INDEX IF NOT EXISTS idx_points_history_user ON user_points_history(user_id);

-- =============================================================
-- Order & Payment system (v1.2.0)
-- =============================================================

CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no        TEXT    NOT NULL UNIQUE,               -- human-readable unique order number
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled', 'refunded')),
    total_amount    INTEGER NOT NULL,                      -- total in 不思议币 (integer)
    currency        TEXT    NOT NULL DEFAULT 'WONDER',
    paid_at         DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    journey_id      INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    journey_title   TEXT    NOT NULL,
    unit_price      INTEGER NOT NULL,                      -- price at time of order
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
    subtotal        INTEGER NOT NULL                       -- unit_price * quantity
);

-- Transaction ledger: every balance change is recorded (audit trail)
CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    txn_type        TEXT    NOT NULL CHECK(txn_type IN ('recharge', 'purchase', 'refund', 'bonus')),
    amount          INTEGER NOT NULL,                      -- positive = credit, negative = debit
    balance_after   INTEGER NOT NULL,
    description     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order   ON transactions(order_id);

-- =============================================================
-- Analytics event buffer (v1.3.0)
-- Non-critical product analytics only. P0 order/payment ledger events
-- stay in orders + transactions and must not depend on this queue.
-- =============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type      TEXT    NOT NULL CHECK(event_type IN ('journey_view', 'journey_click', 'pet_reply', 'search', 'filter')),
    journey_slug    TEXT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    mbti_type       TEXT,
    gender          TEXT    NOT NULL DEFAULT 'unknown',
    metadata        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type    ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_journey_slug  ON analytics_events(journey_slug);
CREATE INDEX IF NOT EXISTS idx_analytics_user          ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at    ON analytics_events(created_at);

-- =============================================================
-- Persistent audit logs (v1.4.0)
-- API errors and runtime request evidence for later debugging.
-- =============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT,
    level           TEXT    NOT NULL CHECK(level IN ('info','warn','error','panic')),
    source          TEXT    NOT NULL DEFAULT 'api',
    method          TEXT,
    path            TEXT,
    status_code     INTEGER,
    latency_ms      INTEGER,
    client_ip       TEXT,
    user_agent      TEXT,
    message         TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_level      ON audit_logs(level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
