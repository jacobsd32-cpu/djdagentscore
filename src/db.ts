import Database, { type Database as DatabaseType, type Transaction } from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ScoreRow,
  ScoreHistoryRow,
  FraudReportRow,
  AgentRegistrationRow,
  LeaderboardRow,
  FullScoreResponse,
  Tier,
} from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'scores.db')

// Ensure data directory exists
import fs from 'node:fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db: DatabaseType = new Database(DB_PATH)

// Performance & safety settings
// NOTE: We use DELETE journal mode instead of WAL because Fly.io volumes are
// network-attached storage (not local disk). WAL relies on shared-memory
// (mmap) semantics that are not guaranteed on network-attached volumes and
// can silently corrupt the database on crash or volume hiccup. DELETE mode
// is slower for concurrent reads but safe on any filesystem.
// Switch to WAL only if running on local SSD / persistent disk.
db.pragma('journal_mode = DELETE')
db.pragma('synchronous = FULL')
db.pragma('foreign_keys = ON')

// ---------- Schema ----------

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

function addColumnIfMissing(table: string, column: string, definition: string): void {
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

  CREATE TABLE IF NOT EXISTS mutual_ratings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rater_wallet TEXT NOT NULL,
    rated_wallet TEXT NOT NULL,
    tx_hash      TEXT,
    rating       INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ratings_rated  ON mutual_ratings(rated_wallet, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ratings_rater  ON mutual_ratings(rater_wallet);

  -- Staking & Badges
  CREATE TABLE IF NOT EXISTS creator_stakes (
    id                TEXT PRIMARY KEY,
    creator_wallet    TEXT NOT NULL,
    agent_wallet      TEXT NOT NULL,
    stake_amount      REAL NOT NULL,
    stake_tx_hash     TEXT,
    status            TEXT DEFAULT 'active',
    score_boost       INTEGER DEFAULT 0,
    staked_at         TEXT NOT NULL DEFAULT (datetime('now')),
    return_eligible   TEXT,
    slashed_at        TEXT,
    slash_report_id   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stakes_agent ON creator_stakes(agent_wallet);

  CREATE TABLE IF NOT EXISTS badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    badge_type  TEXT NOT NULL,
    granted_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT,
    active      INTEGER DEFAULT 1,
    metadata    TEXT    DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_badges_wallet ON badges(wallet, active);

  -- Monitoring
  CREATE TABLE IF NOT EXISTS monitoring_subscriptions (
    id                 TEXT PRIMARY KEY,
    subscriber_wallet  TEXT NOT NULL,
    target_wallet      TEXT NOT NULL,
    alert_type         TEXT NOT NULL,
    threshold          INTEGER,
    webhook_url        TEXT,
    active             INTEGER DEFAULT 1,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    last_billed        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_monitor_target ON monitoring_subscriptions(target_wallet, active);

  CREATE TABLE IF NOT EXISTS certified_subscriptions (
    id              TEXT PRIMARY KEY,
    wallet          TEXT UNIQUE NOT NULL,
    tier            TEXT    DEFAULT 'certified',
    refresh_interval INTEGER DEFAULT 900,
    active          INTEGER DEFAULT 1,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_billed     TEXT,
    billing_amount  REAL    DEFAULT 5.0
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

  CREATE TABLE IF NOT EXISTS cluster_assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    cluster_id  TEXT NOT NULL,
    cluster_name TEXT,
    confidence  REAL DEFAULT 0,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_cluster_wallet ON cluster_assignments(wallet);
  CREATE INDEX IF NOT EXISTS idx_cluster_id     ON cluster_assignments(cluster_id);

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
`)

// Migrate agent_registrations to add GitHub verification columns (must run after table is created)
addColumnIfMissing('agent_registrations', 'github_verified', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('agent_registrations', 'github_stars', 'INTEGER')
addColumnIfMissing('agent_registrations', 'github_pushed_at', 'TEXT')
addColumnIfMissing('agent_registrations', 'github_verified_at', 'TEXT')

// ---------- Prepared statements ----------

const stmtUpsertScore = db.prepare(`
  INSERT INTO scores
    (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score,
     tier, raw_data, calculated_at, expires_at,
     confidence, recommendation, model_version, sybil_flag, sybil_indicators, gaming_indicators, behavior_score)
  VALUES
    (@wallet, @composite_score, @reliability_score, @viability_score, @identity_score, @capability_score,
     @tier, @raw_data, @calculated_at, @expires_at,
     @confidence, @recommendation, @model_version, @sybil_flag, @sybil_indicators, @gaming_indicators, @behavior_score)
  ON CONFLICT(wallet) DO UPDATE SET
    composite_score   = excluded.composite_score,
    reliability_score = excluded.reliability_score,
    viability_score   = excluded.viability_score,
    identity_score    = excluded.identity_score,
    capability_score  = excluded.capability_score,
    tier              = excluded.tier,
    raw_data          = excluded.raw_data,
    calculated_at     = excluded.calculated_at,
    expires_at        = excluded.expires_at,
    confidence        = excluded.confidence,
    recommendation    = excluded.recommendation,
    model_version     = excluded.model_version,
    sybil_flag        = excluded.sybil_flag,
    sybil_indicators  = excluded.sybil_indicators,
    gaming_indicators = excluded.gaming_indicators,
    behavior_score    = excluded.behavior_score
`)

const stmtGetScore = db.prepare<[string], ScoreRow>(`
  SELECT * FROM scores WHERE wallet = ?
`)

const stmtInsertHistory = db.prepare(`
  INSERT INTO score_history (wallet, score, calculated_at, confidence, model_version)
  VALUES (?, ?, ?, ?, ?)
`)

const stmtGetHistory = db.prepare<[string], ScoreHistoryRow>(`
  SELECT * FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 10
`)

const stmtGetExpired = db.prepare<[], { wallet: string }>(`
  SELECT wallet FROM scores WHERE expires_at < datetime('now')
`)

const stmtCountScores = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM scores
`)

const stmtLeaderboard = db.prepare<[], LeaderboardRow>(`
  SELECT s.*,
         CASE WHEN r.wallet IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
         COALESCE(r.github_verified, 0)                   AS github_verified_badge
  FROM scores s
  LEFT JOIN agent_registrations r ON LOWER(s.wallet) = r.wallet
  WHERE s.composite_score > 0
  ORDER BY s.composite_score DESC
  LIMIT 50
`)

const stmtCountRegistered = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM agent_registrations
`)

const stmtInsertReport = db.prepare(`
  INSERT INTO fraud_reports (id, target_wallet, reporter_wallet, reason, details, created_at, penalty_applied)
  VALUES (@id, @target_wallet, @reporter_wallet, @reason, @details, @created_at, @penalty_applied)
`)

const stmtCountReports = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ?
`)

const stmtGetReportsByTarget = db.prepare<[string], FraudReportRow>(`
  SELECT * FROM fraud_reports WHERE target_wallet = ? ORDER BY created_at DESC
`)

const stmtApplyPenalty = db.prepare(`
  UPDATE scores
  SET composite_score = MAX(0, composite_score - ?),
      tier = ?,
      calculated_at = datetime('now')
  WHERE wallet = ?
`)

const stmtUpsertRegistration = db.prepare(`
  INSERT INTO agent_registrations (wallet, name, description, github_url, website_url, registered_at, updated_at)
  VALUES (@wallet, @name, @description, @github_url, @website_url, datetime('now'), datetime('now'))
  ON CONFLICT(wallet) DO UPDATE SET
    name          = excluded.name,
    description   = excluded.description,
    github_url    = excluded.github_url,
    website_url   = excluded.website_url,
    updated_at    = datetime('now')
`)

const stmtGetRegistration = db.prepare<[string], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE wallet = ?
`)

const stmtAllRegistrationsWithGithub = db.prepare<[], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE github_url IS NOT NULL
`)

const stmtUpdateGithub = db.prepare(`
  UPDATE agent_registrations
  SET github_verified    = @github_verified,
      github_stars       = @github_stars,
      github_pushed_at   = @github_pushed_at,
      github_verified_at = datetime('now')
  WHERE wallet = @wallet
`)

// ---------- Exported helpers ----------

const TTL_MS = 60 * 60 * 1000 // 1 hour

export function scoreToTier(score: number): Tier {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Trusted'
  if (score >= 50) return 'Established'
  if (score >= 25) return 'Emerging'
  return 'Unverified'
}

export interface ScoreMetadata {
  confidence?: number
  recommendation?: string
  modelVersion?: string
  sybilFlag?: boolean
  sybilIndicators?: string[]
  gamingIndicators?: string[]
}

export function upsertScore(
  wallet: string,
  compositeScore: number,
  reliabilityScore: number,
  viabilityScore: number,
  identityScore: number,
  capabilityScore: number,
  behaviorScore: number | null,
  rawData: object,
  meta: ScoreMetadata = {},
): void {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TTL_MS)
  const tier = scoreToTier(compositeScore)

  upsertScoreTxn(
    wallet,
    compositeScore,
    reliabilityScore,
    viabilityScore,
    identityScore,
    capabilityScore,
    behaviorScore,
    tier,
    rawData,
    now,
    expiresAt,
    meta,
  )
}

const upsertScoreTxn = db.transaction(
  (
    wallet: string,
    compositeScore: number,
    reliabilityScore: number,
    viabilityScore: number,
    identityScore: number,
    capabilityScore: number,
    behaviorScore: number | null,
    tier: string,
    rawData: object,
    now: Date,
    expiresAt: Date,
    meta: ScoreMetadata,
  ) => {
    stmtUpsertScore.run({
      wallet,
      composite_score: compositeScore,
      reliability_score: reliabilityScore,
      viability_score: viabilityScore,
      identity_score: identityScore,
      capability_score: capabilityScore,
      behavior_score: behaviorScore,
      tier,
      raw_data: JSON.stringify(rawData),
      calculated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      confidence: meta.confidence ?? 0.0,
      recommendation: meta.recommendation ?? 'insufficient_history',
      model_version: meta.modelVersion ?? '1.0.0',
      sybil_flag: meta.sybilFlag ? 1 : 0,
      sybil_indicators: JSON.stringify(meta.sybilIndicators ?? []),
      gaming_indicators: JSON.stringify(meta.gamingIndicators ?? []),
    })

    stmtInsertHistory.run(
      wallet,
      compositeScore,
      now.toISOString(),
      meta.confidence ?? 0.0,
      meta.modelVersion ?? '1.0.0',
    )

    // Record in score_decay for temporal tracking
    db.prepare(
      `INSERT INTO score_decay (wallet, composite_score) VALUES (?, ?)`,
    ).run(wallet, compositeScore)

    // Mark wallet as scored in wallet_index if it exists
    db.prepare(
      `UPDATE wallet_index SET is_scored = 1, last_seen = ? WHERE wallet = ?`,
    ).run(now.toISOString(), wallet)

    // Keep only last 50 history entries per wallet
    db.prepare(
      `DELETE FROM score_history WHERE wallet = ? AND id NOT IN
       (SELECT id FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 50)`,
    ).run(wallet, wallet)
  },
)

export function getScore(wallet: string): ScoreRow | undefined {
  return stmtGetScore.get(wallet)
}

export function getScoreHistory(wallet: string): ScoreHistoryRow[] {
  return stmtGetHistory.all(wallet)
}

export function getExpiredWallets(): string[] {
  return stmtGetExpired.all().map((r) => r.wallet)
}

export function countCachedScores(): number {
  return stmtCountScores.get()!.count
}

export function getLeaderboard(): LeaderboardRow[] {
  return stmtLeaderboard.all()
}

export function countRegisteredAgents(): number {
  return stmtCountRegistered.get()!.count
}

export function upsertRegistration(reg: {
  wallet: string
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
}): void {
  stmtUpsertRegistration.run(reg)
}

export function getRegistration(wallet: string): AgentRegistrationRow | undefined {
  return stmtGetRegistration.get(wallet)
}

export function getAllRegistrationsWithGithub(): AgentRegistrationRow[] {
  return stmtAllRegistrationsWithGithub.all()
}

export function updateGithubVerification(
  wallet: string,
  verified: boolean,
  stars: number | null,
  pushedAt: string | null,
): void {
  stmtUpdateGithub.run({ wallet, github_verified: verified ? 1 : 0, github_stars: stars, github_pushed_at: pushedAt })
}

export function insertReport(report: {
  id: string
  target_wallet: string
  reporter_wallet: string
  reason: string
  details: string
  penalty_applied: number
}): void {
  stmtInsertReport.run({
    ...report,
    created_at: new Date().toISOString(),
  })
}

export function countReportsByTarget(wallet: string): number {
  return stmtCountReports.get(wallet)!.count
}

export function applyReportPenalty(wallet: string, penalty: number): void {
  const row = stmtGetScore.get(wallet)
  if (!row) return
  const newScore = Math.max(0, row.composite_score - penalty)
  const newTier = scoreToTier(newScore)
  stmtApplyPenalty.run(penalty, newTier, wallet)
}

export function getReportsByTarget(wallet: string): FraudReportRow[] {
  return stmtGetReportsByTarget.all(wallet)
}

// ---------- query_log helpers ----------

const stmtInsertQueryLog = db.prepare(`
  INSERT INTO query_log
    (requester_wallet, target_wallet, endpoint, tier_requested, target_score, target_tier,
     response_source, response_time_ms, user_agent, price_paid, is_free_tier, timestamp)
  VALUES
    (@requester_wallet, @target_wallet, @endpoint, @tier_requested, @target_score, @target_tier,
     @response_source, @response_time_ms, @user_agent, @price_paid, @is_free_tier, @timestamp)
`)

export function insertQueryLog(entry: {
  requester_wallet: string | null
  target_wallet: string | null
  endpoint: string
  tier_requested: string | null
  target_score: number | null
  target_tier: string | null
  response_source: string | null
  response_time_ms: number
  user_agent: string | null
  price_paid: number
  is_free_tier: number
  timestamp: string
}): void {
  stmtInsertQueryLog.run(entry)
}

// Count basic-endpoint free-tier uses for a given key (wallet or ip hash) today
export function countFreeTierUsesToday(requesterKey: string): number {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const row = db
    .prepare<[string, string, string], { count: number }>(
      `SELECT COUNT(*) as count FROM query_log
       WHERE (requester_wallet = ? OR requester_wallet = ?)
         AND endpoint = '/v1/score/basic'
         AND timestamp >= ?
         AND is_free_tier = 1`,
    )
    .get(requesterKey, requesterKey, dayStart.toISOString())
  return row?.count ?? 0
}

export function countTotalQueryLogs(): number {
  return (
    db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM query_log').get()?.count ?? 0
  )
}

// ---------- wallet_index helpers ----------

export function countIndexedWallets(): number {
  return (
    db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM wallet_index')
      .get()?.count ?? 0
  )
}

// ---------- raw_transactions helpers ----------

export function getWalletX402Stats(wallet: string): {
  x402TxCount: number
  x402InflowsUsd: number
  x402OutflowsUsd: number
  x402FirstSeen: string | null
  x402LastSeen: string | null
} {
  const w = wallet.toLowerCase()
  const row = db.prepare<[string, string, string, string], {
    tx_count: number
    inflows: number
    outflows: number
    first_seen: string | null
    last_seen: string | null
  }>(`
    SELECT
      COUNT(*) as tx_count,
      COALESCE(SUM(CASE WHEN to_wallet = ? THEN amount_usdc ELSE 0 END), 0) as inflows,
      COALESCE(SUM(CASE WHEN from_wallet = ? THEN amount_usdc ELSE 0 END), 0) as outflows,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen
    FROM raw_transactions
    WHERE from_wallet = ? OR to_wallet = ?
  `).get(w, w, w, w)

  return {
    x402TxCount: row?.tx_count ?? 0,
    x402InflowsUsd: row?.inflows ?? 0,
    x402OutflowsUsd: row?.outflows ?? 0,
    x402FirstSeen: row?.first_seen ?? null,
    x402LastSeen: row?.last_seen ?? null,
  }
}

export function getWalletFirstX402Seen(wallet: string): string | null {
  const w = wallet.toLowerCase()
  const row = db.prepare<[string, string], { first_seen: string | null }>(
    `SELECT MIN(timestamp) as first_seen FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ?`
  ).get(w, w)
  return row?.first_seen ?? null
}

export function getWalletIndexFirstSeen(wallet: string): string | null {
  const w = wallet.toLowerCase()
  try {
    const row = db.prepare<[string], { first_seen: string | null }>(
      `SELECT first_seen FROM wallet_index WHERE wallet = ?`
    ).get(w)
    return row?.first_seen ?? null
  } catch { return null }
}

export function countIndexedTransactions(): number {
  return (
    db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM raw_transactions')
      .get()?.count ?? 0
  )
}

export function countScoreOutcomes(): number {
  return (
    db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM score_outcomes')
      .get()?.count ?? 0
  )
}

export function countFraudReports(): number {
  return (
    db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM fraud_reports')
      .get()?.count ?? 0
  )
}

// ---------- indexer_state helpers ----------

export function getIndexerState(key: string): string | null {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM indexer_state WHERE key = ?')
    .get(key)
  return row?.value ?? null
}

export function setIndexerState(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(key, value)
}

// ---------- blockchain indexer batch helpers ----------

const stmtInsertRawTx = db.prepare(`
  INSERT OR IGNORE INTO raw_transactions
    (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
  VALUES
    (@tx_hash, @block_number, @from_wallet, @to_wallet, @amount_usdc, @timestamp)
`)

const stmtUpsertWalletFrom = db.prepare(`
  INSERT INTO wallet_index (wallet, first_seen, last_seen, total_tx_count, total_volume_out)
  VALUES (@wallet, @ts, @ts, 1, @vol)
  ON CONFLICT(wallet) DO UPDATE SET
    first_seen       = MIN(first_seen, excluded.first_seen),
    last_seen        = MAX(last_seen,  excluded.last_seen),
    total_tx_count   = total_tx_count + 1,
    total_volume_out = total_volume_out + excluded.total_volume_out
`)

const stmtUpsertWalletTo = db.prepare(`
  INSERT INTO wallet_index (wallet, first_seen, last_seen, total_tx_count, total_volume_in)
  VALUES (@wallet, @ts, @ts, 1, @vol)
  ON CONFLICT(wallet) DO UPDATE SET
    first_seen      = MIN(first_seen, excluded.first_seen),
    last_seen       = MAX(last_seen,  excluded.last_seen),
    total_tx_count  = total_tx_count + 1,
    total_volume_in = total_volume_in + excluded.total_volume_in
`)

const stmtUpsertRelationship = db.prepare(`
  INSERT INTO relationship_graph
    (wallet_a, wallet_b, tx_count_a_to_b, tx_count_b_to_a,
     total_volume_a_to_b, total_volume_b_to_a, first_interaction, last_interaction)
  VALUES
    (@wallet_a, @wallet_b, @cnt_atob, @cnt_btoa, @vol_atob, @vol_btoa, @ts, @ts)
  ON CONFLICT(wallet_a, wallet_b) DO UPDATE SET
    tx_count_a_to_b     = tx_count_a_to_b     + @cnt_atob,
    tx_count_b_to_a     = tx_count_b_to_a     + @cnt_btoa,
    total_volume_a_to_b = total_volume_a_to_b + @vol_atob,
    total_volume_b_to_a = total_volume_b_to_a + @vol_btoa,
    last_interaction    = MAX(last_interaction, excluded.last_interaction)
`)

export interface IndexedTransfer {
  txHash: string
  blockNumber: number
  fromWallet: string
  toWallet: string
  amountUsdc: number
  timestamp: string
}

// ---------- confidence signal helpers ----------

export function countUniquePartners(wallet: string): number {
  const w = wallet.toLowerCase()
  const row = db
    .prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) as count FROM relationship_graph WHERE wallet_a = ? OR wallet_b = ?`,
    )
    .get(w, w)
  return row?.count ?? 0
}

export function countRatingsReceived(wallet: string): number {
  const row = db
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) as count FROM mutual_ratings WHERE rated_wallet = ?`,
    )
    .get(wallet.toLowerCase())
  return row?.count ?? 0
}

export function countPriorQueries(wallet: string): number {
  const row = db
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) as count FROM query_log WHERE target_wallet = ?`,
    )
    .get(wallet.toLowerCase())
  return row?.count ?? 0
}

// ---------- behavior dimension helpers ----------

/** Return ISO-8601 timestamps for a wallet, preferring usdc_transfers then raw_transactions. */
export function getTransferTimestamps(wallet: string): string[] {
  const w = wallet.toLowerCase()
  // Try usdc_transfers first (P1 indexed data)
  let rows = db
    .prepare<[string, string], { timestamp: string }>(
      `SELECT timestamp FROM usdc_transfers WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp`,
    )
    .all(w, w)
  if (rows.length >= 10) return rows.map(r => r.timestamp)
  // Fallback to raw_transactions (x402 indexer data)
  rows = db
    .prepare<[string, string], { timestamp: string }>(
      `SELECT timestamp FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp`,
    )
    .all(w, w)
  return rows.map(r => r.timestamp)
}

export const indexTransferBatch: Transaction<(transfers: IndexedTransfer[]) => void> = db.transaction((transfers: IndexedTransfer[]) => {
  for (const t of transfers) {
    const from = t.fromWallet.toLowerCase()
    const to = t.toWallet.toLowerCase()

    stmtInsertRawTx.run({
      tx_hash: t.txHash,
      block_number: t.blockNumber,
      from_wallet: from,
      to_wallet: to,
      amount_usdc: t.amountUsdc,
      timestamp: t.timestamp,
    })

    stmtUpsertWalletFrom.run({ wallet: from, ts: t.timestamp, vol: t.amountUsdc })
    stmtUpsertWalletTo.run({ wallet: to, ts: t.timestamp, vol: t.amountUsdc })

    // Normalize: lexically smaller address = wallet_a
    const [wallet_a, wallet_b] = from < to ? [from, to] : [to, from]
    const isAtoB = from < to

    stmtUpsertRelationship.run({
      wallet_a,
      wallet_b,
      cnt_atob: isAtoB ? 1 : 0,
      cnt_btoa: isAtoB ? 0 : 1,
      vol_atob: isAtoB ? t.amountUsdc : 0,
      vol_btoa: isAtoB ? 0 : t.amountUsdc,
      ts: t.timestamp,
    })
  }
})
