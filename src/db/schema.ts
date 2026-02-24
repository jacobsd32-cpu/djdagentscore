/**
 * Schema — CREATE TABLE statements and column migrations.
 *
 * This module is imported for its side-effects (table creation).
 * It must run BEFORE queries.ts so that prepared statements can compile.
 */

import { db } from './connection.js'

// ---------- Core tables ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    wallet         TEXT PRIMARY KEY,
    composite_score INTEGER NOT NULL,
    reliability_score INTEGER NOT NULL,
    viability_score   INTEGER NOT NULL,
    identity_score    INTEGER NOT NULL,
    capability_score  INTEGER NOT NULL,
    tier           TEXT NOT NULL,
    raw_data       TEXT NOT NULL,
    calculated_at  TEXT NOT NULL,
    expires_at     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scores_expires ON scores(expires_at);
  CREATE INDEX IF NOT EXISTS idx_scores_composite ON scores(composite_score DESC);

  CREATE TABLE IF NOT EXISTS score_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet        TEXT NOT NULL,
    score         INTEGER NOT NULL,
    calculated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_wallet ON score_history(wallet, calculated_at DESC);

  CREATE TABLE IF NOT EXISTS fraud_reports (
    id              TEXT PRIMARY KEY,
    target_wallet   TEXT NOT NULL,
    reporter_wallet TEXT NOT NULL,
    reason          TEXT NOT NULL,
    details         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    penalty_applied INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_reports_target ON fraud_reports(target_wallet);
`)

// ---------- Migrate: add new columns to scores table ----------

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!VALID_IDENTIFIER.test(table) || !VALID_IDENTIFIER.test(column)) {
    throw new Error(`Invalid SQL identifier: table=${table}, column=${column}`)
  }
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

addColumnIfMissing('scores', 'confidence', 'REAL DEFAULT 0.0')
addColumnIfMissing('scores', 'recommendation', "TEXT DEFAULT 'insufficient_history'")
addColumnIfMissing('scores', 'model_version', "TEXT DEFAULT '1.0.0'")
addColumnIfMissing('scores', 'sybil_flag', 'INTEGER DEFAULT 0')
addColumnIfMissing('scores', 'sybil_indicators', "TEXT DEFAULT '[]'")
addColumnIfMissing('scores', 'gaming_indicators', "TEXT DEFAULT '[]'")
addColumnIfMissing('scores', 'behavior_score', 'INTEGER')

// Migrate score_history to include confidence + model_version
addColumnIfMissing('score_history', 'confidence', 'REAL DEFAULT 0.0')
addColumnIfMissing('score_history', 'model_version', "TEXT DEFAULT '1.0.0'")

// ---------- New tables ----------

db.exec(`
  -- Indexer state
  CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Core Scoring extras
  CREATE TABLE IF NOT EXISTS score_decay (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet        TEXT NOT NULL,
    composite_score INTEGER NOT NULL,
    recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_score_decay_wallet ON score_decay(wallet, recorded_at DESC);

  CREATE TABLE IF NOT EXISTS model_versions (
    version      TEXT PRIMARY KEY,
    weights_json TEXT NOT NULL,
    features_json TEXT NOT NULL,
    released_at  TEXT NOT NULL DEFAULT (datetime('now')),
    notes        TEXT
  );
  INSERT OR IGNORE INTO model_versions (version, weights_json, features_json, notes) VALUES (
    '1.0.0',
    '{"reliability":0.35,"viability":0.30,"identity":0.20,"capability":0.15}',
    '["sybil_detection","velocity_checks","confidence_interval"]',
    'Initial launch model'
  );
  INSERT OR IGNORE INTO model_versions (version, weights_json, features_json, notes) VALUES (
    '2.0.0',
    '{"reliability":0.30,"viability":0.25,"identity":0.20,"behavior":0.15,"capability":0.10}',
    '["sybil_detection","gaming_detection","behavior_analysis","integrity_multiplier","confidence_interval","data_availability","improvement_path"]',
    'Scoring overhaul v2 — 5 dimensions, multiplicative integrity, behavior analysis'
  );

  -- Blockchain Indexing
  CREATE TABLE IF NOT EXISTS raw_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash      TEXT UNIQUE NOT NULL,
    block_number INTEGER NOT NULL,
    from_wallet  TEXT NOT NULL,
    to_wallet    TEXT NOT NULL,
    amount_usdc  REAL NOT NULL,
    timestamp    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_raw_tx_from  ON raw_transactions(from_wallet, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_raw_tx_to    ON raw_transactions(to_wallet,   timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_raw_tx_block ON raw_transactions(block_number);

  CREATE TABLE IF NOT EXISTS wallet_index (
    wallet                  TEXT PRIMARY KEY,
    first_seen              TEXT NOT NULL,
    last_seen               TEXT NOT NULL,
    total_tx_count          INTEGER DEFAULT 0,
    total_volume_in         REAL    DEFAULT 0,
    total_volume_out        REAL    DEFAULT 0,
    is_proactively_indexed  INTEGER DEFAULT 1,
    is_scored               INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_wallet_last_seen ON wallet_index(last_seen DESC);

  CREATE TABLE IF NOT EXISTS wallet_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    usdc_balance REAL NOT NULL,
    snapshot_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_wallet ON wallet_snapshots(wallet, snapshot_at DESC);

  CREATE TABLE IF NOT EXISTS wallet_metrics (
    wallet              TEXT PRIMARY KEY,
    tx_count_24h        INTEGER DEFAULT 0,
    tx_count_7d         INTEGER DEFAULT 0,
    tx_count_30d        INTEGER DEFAULT 0,
    volume_in_24h       REAL    DEFAULT 0,
    volume_in_7d        REAL    DEFAULT 0,
    volume_in_30d       REAL    DEFAULT 0,
    volume_out_24h      REAL    DEFAULT 0,
    volume_out_7d       REAL    DEFAULT 0,
    volume_out_30d      REAL    DEFAULT 0,
    income_burn_ratio   REAL    DEFAULT 0,
    balance_trend_7d    TEXT    DEFAULT 'stable',
    unique_partners_30d INTEGER DEFAULT 0,
    last_updated        TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Relationship Graph
  CREATE TABLE IF NOT EXISTS relationship_graph (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_a            TEXT NOT NULL,
    wallet_b            TEXT NOT NULL,
    tx_count_a_to_b     INTEGER DEFAULT 0,
    tx_count_b_to_a     INTEGER DEFAULT 0,
    total_volume_a_to_b REAL    DEFAULT 0,
    total_volume_b_to_a REAL    DEFAULT 0,
    first_interaction   TEXT NOT NULL,
    last_interaction    TEXT NOT NULL,
    UNIQUE(wallet_a, wallet_b)
  );
  CREATE INDEX IF NOT EXISTS idx_graph_a ON relationship_graph(wallet_a);
  CREATE INDEX IF NOT EXISTS idx_graph_b ON relationship_graph(wallet_b);

  -- Fraud & Trust extras
  CREATE TABLE IF NOT EXISTS fraud_patterns (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_name      TEXT NOT NULL,
    pattern_signature TEXT NOT NULL,
    occurrences       INTEGER DEFAULT 0,
    risk_weight       REAL    DEFAULT 0,
    first_detected    TEXT,
    last_detected     TEXT
  );

  -- Analytics
  CREATE TABLE IF NOT EXISTS query_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_wallet  TEXT,
    target_wallet     TEXT,
    endpoint          TEXT NOT NULL,
    tier_requested    TEXT,
    target_score      INTEGER,
    target_tier       TEXT,
    response_source   TEXT,
    response_time_ms  INTEGER,
    user_agent        TEXT,
    price_paid        REAL    DEFAULT 0,
    is_free_tier      INTEGER DEFAULT 0,
    timestamp         TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_qlog_requester  ON query_log(requester_wallet, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_qlog_target     ON query_log(target_wallet,    timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_qlog_timestamp  ON query_log(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_qlog_endpoint   ON query_log(endpoint,         timestamp DESC);

  CREATE TABLE IF NOT EXISTS intent_signals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_wallet  TEXT NOT NULL,
    target_wallet     TEXT NOT NULL,
    query_timestamp   TEXT NOT NULL,
    followed_by_tx    INTEGER DEFAULT 0,
    tx_hash           TEXT,
    tx_timestamp      TEXT,
    time_to_tx_ms     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_intent_requester ON intent_signals(requester_wallet, query_timestamp DESC);

  CREATE TABLE IF NOT EXISTS score_outcomes (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id              INTEGER,
    target_wallet         TEXT NOT NULL,
    requester_wallet      TEXT,
    score_at_query        INTEGER,
    tier_at_query         TEXT,
    confidence_at_query   REAL,
    model_version         TEXT,
    outcome_type          TEXT,
    outcome_at            TEXT,
    days_to_outcome       INTEGER,
    outcome_value         REAL
  );
  CREATE INDEX IF NOT EXISTS idx_outcomes_score  ON score_outcomes(score_at_query, outcome_type);
  CREATE INDEX IF NOT EXISTS idx_outcomes_model  ON score_outcomes(model_version,  outcome_type);
  CREATE INDEX IF NOT EXISTS idx_outcomes_target ON score_outcomes(target_wallet);

  CREATE TABLE IF NOT EXISTS economy_metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start      TEXT NOT NULL,
    period_end        TEXT NOT NULL,
    period_type       TEXT NOT NULL,
    total_wallets     INTEGER DEFAULT 0,
    new_wallets       INTEGER DEFAULT 0,
    dead_wallets      INTEGER DEFAULT 0,
    active_wallets    INTEGER DEFAULT 0,
    total_tx_count    INTEGER DEFAULT 0,
    total_volume      REAL    DEFAULT 0,
    avg_tx_size       REAL    DEFAULT 0,
    median_score      INTEGER DEFAULT 0,
    avg_score         REAL    DEFAULT 0,
    elite_count       INTEGER DEFAULT 0,
    trusted_count     INTEGER DEFAULT 0,
    established_count INTEGER DEFAULT 0,
    emerging_count    INTEGER DEFAULT 0,
    unverified_count  INTEGER DEFAULT 0,
    total_fraud_reports INTEGER DEFAULT 0,
    total_queries     INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_economy_period ON economy_metrics(period_type, period_start DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_economy_metrics_unique ON economy_metrics(period_type, period_start);

  -- Agent self-registration (bootstraps identity scoring before x402 volume exists)
  CREATE TABLE IF NOT EXISTS agent_registrations (
    wallet        TEXT PRIMARY KEY,
    name          TEXT,
    description   TEXT,
    github_url    TEXT,
    website_url   TEXT,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// ── P1: USDC Transfer Index ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usdc_transfers (
    tx_hash TEXT NOT NULL UNIQUE,
    block_number INTEGER NOT NULL,
    from_wallet TEXT NOT NULL,
    to_wallet TEXT NOT NULL,
    amount_usdc REAL NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_from ON usdc_transfers(from_wallet);
  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_to ON usdc_transfers(to_wallet);
  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_block ON usdc_transfers(block_number);

  -- P3: Calibration Reports
  CREATE TABLE IF NOT EXISTS calibration_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT,
    period_start TEXT,
    period_end TEXT,
    total_scored INTEGER,
    avg_score_by_outcome TEXT,
    tier_accuracy TEXT,
    recommendations TEXT,
    model_version TEXT
  );

  CREATE TABLE IF NOT EXISTS wallet_transfer_stats (
    wallet TEXT PRIMARY KEY,
    total_tx_count INTEGER DEFAULT 0,
    total_volume_in REAL DEFAULT 0,
    total_volume_out REAL DEFAULT 0,
    unique_partners INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    updated_at TEXT
  );
`)

// Migrate agent_registrations to add GitHub verification columns (must run after table is created)
addColumnIfMissing('agent_registrations', 'github_verified', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('agent_registrations', 'github_stars', 'INTEGER')
addColumnIfMissing('agent_registrations', 'github_pushed_at', 'TEXT')
addColumnIfMissing('agent_registrations', 'github_verified_at', 'TEXT')

// ── P2: Rate limiting (SQLite-backed, per-payer per-window) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    key    TEXT NOT NULL,
    window TEXT NOT NULL,
    count  INTEGER DEFAULT 1,
    PRIMARY KEY (key, window)
  );

  -- API Key authentication
  CREATE TABLE IF NOT EXISTS api_keys (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash   TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    wallet     TEXT NOT NULL,
    name       TEXT,
    tier       TEXT NOT NULL DEFAULT 'standard',
    monthly_limit   INTEGER NOT NULL DEFAULT 10000,
    monthly_used    INTEGER NOT NULL DEFAULT 0,
    usage_reset_at  TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet);

  -- Webhook subscriptions
  CREATE TABLE IF NOT EXISTS webhooks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT NOT NULL,
    events      TEXT NOT NULL,
    tier        TEXT NOT NULL DEFAULT 'basic',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TEXT,
    disabled_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_webhooks_wallet ON webhooks(wallet);
  CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active, events);

  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id  INTEGER NOT NULL REFERENCES webhooks(id),
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    attempt     INTEGER NOT NULL DEFAULT 1,
    delivered_at TEXT,
    next_retry_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wh_deliveries_retry ON webhook_deliveries(next_retry_at)
    WHERE status_code IS NULL OR status_code >= 400;
`)

// ── Agent Certification ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS certifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    tier        TEXT NOT NULL,
    score_at_certification INTEGER NOT NULL,
    granted_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    tx_hash     TEXT,
    revoked_at  TEXT,
    revocation_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_certs_wallet ON certifications(wallet);
  CREATE INDEX IF NOT EXISTS idx_certs_active ON certifications(is_active, expires_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_certs_wallet_active ON certifications(wallet)
    WHERE is_active = 1;
`)
