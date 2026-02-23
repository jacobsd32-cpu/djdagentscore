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
      amount REAL,
      timestamp TEXT,
      facilitator TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_index (
      wallet TEXT PRIMARY KEY,
      first_seen TEXT,
      last_seen TEXT,
      total_tx_count INTEGER DEFAULT 0,
      total_volume_in REAL DEFAULT 0,
      total_volume_out REAL DEFAULT 0,
      unique_partners INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationship_graph (
      wallet_a TEXT,
      wallet_b TEXT,
      tx_count INTEGER DEFAULT 0,
      total_volume_a_to_b REAL DEFAULT 0,
      total_volume_b_to_a REAL DEFAULT 0,
      first_interaction TEXT,
      last_interaction TEXT,
      PRIMARY KEY (wallet_a, wallet_b)
    );

    CREATE TABLE IF NOT EXISTS wallet_metrics (
      wallet TEXT PRIMARY KEY,
      tx_count_24h INTEGER DEFAULT 0,
      tx_count_7d INTEGER DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      usdc_balance REAL,
      snapshot_at TEXT
    );

    CREATE TABLE IF NOT EXISTS query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_wallet TEXT,
      endpoint TEXT,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER,
      reliability_score INTEGER,
      viability_score INTEGER,
      identity_score INTEGER,
      capability_score INTEGER,
      tier TEXT,
      confidence REAL,
      recommendation TEXT,
      sybil_flag INTEGER DEFAULT 0,
      gaming_detected INTEGER DEFAULT 0,
      model_version TEXT,
      raw_data TEXT,
      meta TEXT,
      scored_at TEXT,
      updated_at TEXT
    );

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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_wallet TEXT,
      target_wallet TEXT,
      reason TEXT,
      evidence TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      resolved_at TEXT
    );

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
  `)

  return db
}
