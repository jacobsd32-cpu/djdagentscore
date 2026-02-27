import Database from 'better-sqlite3'

/**
 * Creates a fresh in-memory SQLite database with the same schema as production.
 * Mirrors the table definitions in src/db.ts.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_transactions (
      tx_hash TEXT UNIQUE,
      block_number INTEGER,
      from_wallet TEXT,
      to_wallet TEXT,
      amount_usdc REAL,
      timestamp TEXT,
      facilitator TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_index (
      wallet                  TEXT PRIMARY KEY,
      first_seen              TEXT,
      last_seen               TEXT,
      total_tx_count          INTEGER DEFAULT 0,
      total_volume_in         REAL DEFAULT 0,
      total_volume_out        REAL DEFAULT 0,
      unique_partners         INTEGER DEFAULT 0,
      is_proactively_indexed  INTEGER DEFAULT 1,
      is_scored               INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationship_graph (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_a            TEXT NOT NULL,
      wallet_b            TEXT NOT NULL,
      tx_count_a_to_b     INTEGER DEFAULT 0,
      tx_count_b_to_a     INTEGER DEFAULT 0,
      total_volume_a_to_b REAL DEFAULT 0,
      total_volume_b_to_a REAL DEFAULT 0,
      first_interaction   TEXT,
      last_interaction    TEXT,
      UNIQUE(wallet_a, wallet_b)
    );

    CREATE TABLE IF NOT EXISTS wallet_metrics (
      wallet              TEXT PRIMARY KEY,
      tx_count_24h        INTEGER DEFAULT 0,
      tx_count_7d         INTEGER DEFAULT 0,
      tx_count_30d        INTEGER DEFAULT 0,
      volume_in_24h       REAL DEFAULT 0,
      volume_in_7d        REAL DEFAULT 0,
      volume_in_30d       REAL DEFAULT 0,
      volume_out_24h      REAL DEFAULT 0,
      volume_out_7d       REAL DEFAULT 0,
      volume_out_30d      REAL DEFAULT 0,
      income_burn_ratio   REAL DEFAULT 0,
      balance_trend_7d    TEXT DEFAULT 'stable',
      unique_partners_30d INTEGER DEFAULT 0,
      last_updated        TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      usdc_balance REAL,
      snapshot_at TEXT
    );

    CREATE TABLE IF NOT EXISTS query_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_wallet  TEXT,
      target_wallet     TEXT,
      endpoint          TEXT NOT NULL DEFAULT '/score',
      tier_requested    TEXT,
      target_score      INTEGER,
      target_tier       TEXT,
      response_source   TEXT,
      response_time_ms  INTEGER,
      user_agent        TEXT,
      price_paid        REAL DEFAULT 0,
      is_free_tier      INTEGER DEFAULT 0,
      timestamp         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      wallet              TEXT PRIMARY KEY,
      composite_score     INTEGER NOT NULL,
      reliability_score   INTEGER NOT NULL,
      viability_score     INTEGER NOT NULL,
      identity_score      INTEGER NOT NULL,
      capability_score    INTEGER NOT NULL,
      tier                TEXT NOT NULL,
      confidence          REAL DEFAULT 0.0,
      recommendation      TEXT DEFAULT 'insufficient_history',
      sybil_flag          INTEGER DEFAULT 0,
      sybil_indicators    TEXT DEFAULT '[]',
      gaming_indicators   TEXT DEFAULT '[]',
      behavior_score      INTEGER,
      model_version       TEXT DEFAULT '1.0.0',
      raw_data            TEXT NOT NULL,
      calculated_at       TEXT NOT NULL,
      expires_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scores_expires ON scores(expires_at);

    CREATE TABLE IF NOT EXISTS score_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER,
      target_wallet TEXT NOT NULL,
      requester_wallet TEXT,
      score_at_query INTEGER,
      tier_at_query TEXT,
      confidence_at_query REAL,
      model_version TEXT,
      outcome_type TEXT,
      outcome_at TEXT,
      days_to_outcome INTEGER,
      outcome_value REAL
    );

    CREATE TABLE IF NOT EXISTS fraud_reports (
      id              TEXT PRIMARY KEY,
      target_wallet   TEXT NOT NULL,
      reporter_wallet TEXT NOT NULL,
      reason          TEXT NOT NULL,
      details         TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL,
      penalty_applied INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reports_target ON fraud_reports(target_wallet);

    CREATE TABLE IF NOT EXISTS usdc_transfers (
      tx_hash TEXT UNIQUE,
      block_number INTEGER,
      from_wallet TEXT,
      to_wallet TEXT,
      amount_usdc REAL,
      timestamp TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_usdc_transfers_from ON usdc_transfers(from_wallet);
    CREATE INDEX IF NOT EXISTS idx_usdc_transfers_to ON usdc_transfers(to_wallet);
    CREATE INDEX IF NOT EXISTS idx_usdc_transfers_block ON usdc_transfers(block_number);

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

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      wallet TEXT NOT NULL,
      name TEXT,
      tier TEXT NOT NULL DEFAULT 'standard',
      monthly_limit INTEGER NOT NULL DEFAULT 10000,
      monthly_used INTEGER NOT NULL DEFAULT 0,
      usage_reset_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      score INTEGER NOT NULL,
      calculated_at TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      model_version TEXT DEFAULT '1.0.0'
    );
    CREATE INDEX IF NOT EXISTS idx_history_wallet ON score_history(wallet, calculated_at DESC);

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

    CREATE TABLE IF NOT EXISTS agent_registrations (
      wallet        TEXT PRIMARY KEY,
      name          TEXT,
      description   TEXT,
      github_url    TEXT,
      website_url   TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS economy_metrics (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start        TEXT NOT NULL,
      period_end          TEXT NOT NULL,
      period_type         TEXT NOT NULL,
      total_wallets       INTEGER DEFAULT 0,
      new_wallets         INTEGER DEFAULT 0,
      dead_wallets        INTEGER DEFAULT 0,
      active_wallets      INTEGER DEFAULT 0,
      total_tx_count      INTEGER DEFAULT 0,
      total_volume        REAL DEFAULT 0,
      avg_tx_size         REAL DEFAULT 0,
      median_score        INTEGER DEFAULT 0,
      avg_score           REAL DEFAULT 0,
      elite_count         INTEGER DEFAULT 0,
      trusted_count       INTEGER DEFAULT 0,
      established_count   INTEGER DEFAULT 0,
      emerging_count      INTEGER DEFAULT 0,
      unverified_count    INTEGER DEFAULT 0,
      total_fraud_reports INTEGER DEFAULT 0,
      total_queries       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reputation_publications (
      wallet          TEXT PRIMARY KEY,
      composite_score INTEGER NOT NULL,
      model_version   TEXT NOT NULL,
      tx_hash         TEXT,
      published_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  return db
}
