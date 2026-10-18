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

-- Localized journey copy (v1.5.0). The journeys table holds the base language (zh);
-- each row here overlays one locale. Empty fields fall back to the base copy.
CREATE TABLE IF NOT EXISTS journey_translations (
    journey_id    INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    locale        TEXT    NOT NULL CHECK(length(locale) BETWEEN 2 AND 10),  -- 'en'
    title         TEXT    NOT NULL,
    subtitle      TEXT,
    story_hook    TEXT    NOT NULL DEFAULT '',
    story         TEXT,
    region        TEXT,
    mood_keywords TEXT,                                                    -- JSON array
    PRIMARY KEY (journey_id, locale)
);

-- Authored entrances (v1.6.0). Source of truth: internal/content/entrances/*.json, synced at startup.
-- World metadata for one journey (language-independent).
CREATE TABLE IF NOT EXISTS journey_entrances (
    journey_id    INTEGER PRIMARY KEY REFERENCES journeys(id) ON DELETE CASCADE,
    no            INTEGER NOT NULL UNIQUE CHECK(no BETWEEN 1 AND 100),
    realm         TEXT    NOT NULL,             -- mirror-salt | fire-stone | ice-night | sand-stars | mist-temple | water-deep | city-rules | old-roads
    pace          TEXT    NOT NULL,             -- hour | day | multi-day
    scale         TEXT    NOT NULL,             -- near | far | polar
    seasons       TEXT    NOT NULL DEFAULT '[]',-- JSON array of season keys
    time_of_day   TEXT    NOT NULL DEFAULT '',
    cover_license TEXT    NOT NULL DEFAULT '',
    cover_source  TEXT    NOT NULL DEFAULT '',
    content_hash  TEXT    NOT NULL DEFAULT ''
);

-- Structured narrative per language (JSON: opens, role, premise, mission, chapters, choice, ending, facts, fiction).
CREATE TABLE IF NOT EXISTS journey_content (
    journey_id INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    locale     TEXT    NOT NULL CHECK(length(locale) BETWEEN 2 AND 10),
    body       TEXT    NOT NULL,
    PRIMARY KEY (journey_id, locale)
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
    event_type      TEXT    NOT NULL CHECK(event_type IN ('journey_view', 'journey_click', 'pet_reply', 'search', 'filter',
                                                      'arrive', 'path_pick', 'type_found', 'space_enter', 'entrance_open',
                                                      'fork_choose', 'compose_start', 'compose_complete', 'register',
                                                      'rub', 'station_enter', 'station_filter', 'ticket_flip', 'ticket_publish',
                                                      'ticket_depart', 'lamp_open', 'lamp_light', 'rack_view')),
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
-- API request evidence, API errors, panic evidence, and frontend client errors.
-- Raw stdout/journal/Nginx runtime logs are intentionally not stored here.
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

-- =============================================================
-- Fork choices (v1.5.0): what a signed-in reader picked at each
-- authored journey's fork. Guests keep theirs in localStorage and
-- merge them on sign-in.
-- =============================================================

CREATE TABLE IF NOT EXISTS journey_choices (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    journey_id  INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    option_key  TEXT    NOT NULL CHECK(length(option_key) BETWEEN 1 AND 32),
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, journey_id)
);

-- =============================================================
-- Compose game: tickets visitors piece together from paper slips (v1.5.0)
-- Each pick is a fragment key from internal/compose/fragments.json ('' = left blank).
-- id is generated by the client, so replaying guest work after sign-in is idempotent;
-- code is the unguessable share code for the public read-only view.
-- =============================================================

CREATE TABLE IF NOT EXISTS compositions (
    id              TEXT    PRIMARY KEY,
    code            TEXT    NOT NULL UNIQUE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place           TEXT    NOT NULL DEFAULT '',
    hour            TEXT    NOT NULL DEFAULT '',
    season          TEXT    NOT NULL DEFAULT '',
    stay            TEXT    NOT NULL DEFAULT '',
    ritual          TEXT    NOT NULL DEFAULT '',
    keepsake        TEXT    NOT NULL DEFAULT '',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compositions_user ON compositions(user_id, created_at);

-- =============================================================
-- The Ticket Road (v1.6.0): slips rubbed at the end of a door, the night station,
-- lamps, the rack by the door, and the safety base. There is no free text anywhere:
-- every stored value is a key from an embedded vocabulary (slips, printed tags,
-- stamps, flags, report reasons). Authors appear only as an alias (a door's role
-- and four digits); author_hash is an HMAC of the account id, never the id itself.
-- =============================================================

-- Slips a signed-in traveller rubbed ("group:key" from the compose catalog) and the door they
-- were rubbed at, which is the postmark the ticket line shows. Guests keep theirs locally.
CREATE TABLE IF NOT EXISTS rubbings (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    frag        TEXT    NOT NULL CHECK(length(frag) BETWEEN 3 AND 80),
    slug        TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, frag)
) WITHOUT ROWID;

-- A kept ticket hung on the station and on the racks of the doors it borrowed from.
-- Denormalised from the ticket's slips so every station read is one indexed query.
CREATE TABLE IF NOT EXISTS ticket_posts (
    code         TEXT    PRIMARY KEY REFERENCES compositions(code) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_hash  TEXT    NOT NULL,
    alias_slug   TEXT    NOT NULL DEFAULT '',
    alias_no     INTEGER NOT NULL DEFAULT 0,
    status       TEXT    NOT NULL DEFAULT 'live' CHECK(status IN ('live', 'hidden', 'removed')),
    realm        TEXT    NOT NULL DEFAULT '',
    place        TEXT    NOT NULL DEFAULT '',
    hour         TEXT    NOT NULL DEFAULT '',
    season       TEXT    NOT NULL DEFAULT '',
    marks        TEXT    NOT NULL DEFAULT '{}',
    transfer     INTEGER NOT NULL DEFAULT 0,
    search_text  TEXT    NOT NULL DEFAULT '',
    borrowed     INTEGER NOT NULL DEFAULT 0,
    posted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_ticket_posts_new      ON ticket_posts(status, posted_at DESC, code DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_posts_realm    ON ticket_posts(status, realm, season, hour);
CREATE INDEX IF NOT EXISTS idx_ticket_posts_place    ON ticket_posts(status, place);
CREATE INDEX IF NOT EXISTS idx_ticket_posts_borrowed ON ticket_posts(status, borrowed DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_posts_user     ON ticket_posts(user_id);

-- The doors a posted ticket borrowed slips from: the rack by each door reads this.
CREATE TABLE IF NOT EXISTS ticket_post_entrances (
    slug  TEXT NOT NULL,
    code  TEXT NOT NULL REFERENCES ticket_posts(code) ON DELETE CASCADE,
    PRIMARY KEY (slug, code)
) WITHOUT ROWID;

-- Printed tags on a posted ticket (keys from internal/road/tags.json, at most five).
CREATE TABLE IF NOT EXISTS ticket_tags (
    code  TEXT    NOT NULL REFERENCES ticket_posts(code) ON DELETE CASCADE,
    tag   TEXT    NOT NULL,
    pos   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (code, tag)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag ON ticket_tags(tag, code);

-- Who set out from someone else's ticket ("从这张票出发"), counted once per traveller.
CREATE TABLE IF NOT EXISTS ticket_borrows (
    code        TEXT    NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (code, user_id)
) WITHOUT ROWID;

-- The enquiry desk: slip texts and tag labels of posted tickets in both languages.
CREATE VIRTUAL TABLE IF NOT EXISTS station_fts USING fts5(code UNINDEXED, body, tokenize = 'trigram');

-- When a signed-in traveller first opened a work and when they last reached its end; a lamp
-- only counts after a real passage (reading time for journeys, a dwell on the ticket's back).
CREATE TABLE IF NOT EXISTS arrivals (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_kind      TEXT    NOT NULL CHECK(work_kind IN ('ticket', 'journey')),
    work_id        TEXT    NOT NULL,
    first_view_at  DATETIME NOT NULL,
    arrived_at     DATETIME,
    PRIMARY KEY (user_id, work_kind, work_id)
) WITHOUT ROWID;

-- One lamp per traveller per work: three wicks (1-5, NULL = not rated), one preset stamp and
-- private mismatch flags. weight is recomputed nightly (account age, arrival, reciprocity).
-- The rater's type is deliberately not stored.
CREATE TABLE IF NOT EXISTS lamps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    work_kind   TEXT    NOT NULL CHECK(work_kind IN ('ticket', 'journey')),
    work_id     TEXT    NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    real        INTEGER CHECK(real BETWEEN 1 AND 5),
    moved       INTEGER CHECK(moved BETWEEN 1 AND 5),
    fit         INTEGER CHECK(fit BETWEEN 1 AND 5),
    stamp       TEXT    NOT NULL DEFAULT '',
    flags       TEXT    NOT NULL DEFAULT '',
    weight      REAL    NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (work_kind, work_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lamps_user ON lamps(user_id, created_at);

-- Aggregates per work (Bayesian shrinkage towards the kind's mean; lower bound for sorting).
CREATE TABLE IF NOT EXISTS lamp_totals (
    work_kind   TEXT    NOT NULL,
    work_id     TEXT    NOT NULL,
    n           INTEGER NOT NULL DEFAULT 0,
    w_sum       REAL    NOT NULL DEFAULT 0,
    real_m      REAL    NOT NULL DEFAULT 0,
    moved_m     REAL    NOT NULL DEFAULT 0,
    fit_m       REAL    NOT NULL DEFAULT 0,
    bright      REAL    NOT NULL DEFAULT 0,
    lower       REAL    NOT NULL DEFAULT 0,
    top_axis    TEXT    NOT NULL DEFAULT '',
    top_stamps  TEXT    NOT NULL DEFAULT '',
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (work_kind, work_id)
) WITHOUT ROWID;

-- "交给站务": one report per traveller per work, with a preset reason. Three trusted
-- reporters dim a ticket until the station master looks at it.
CREATE TABLE IF NOT EXISTS reports (
    work_kind    TEXT    NOT NULL CHECK(work_kind IN ('ticket')),
    work_id      TEXT    NOT NULL,
    reporter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason       TEXT    NOT NULL,
    trusted      INTEGER NOT NULL DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at  DATETIME,
    PRIMARY KEY (work_kind, work_id, reporter_id)
) WITHOUT ROWID;

-- "不再同站": tickets by this author no longer appear for this traveller. Silent both ways.
CREATE TABLE IF NOT EXISTS blocks (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_hash  TEXT    NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, author_hash)
) WITHOUT ROWID;

-- Per-account daily caps (posts, lamps, reports), counted in the same transaction as the act.
CREATE TABLE IF NOT EXISTS daily_caps (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      TEXT    NOT NULL,
    kind     TEXT    NOT NULL,
    n        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, kind)
) WITHOUT ROWID;
