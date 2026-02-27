/**
 * Prepared statements and exported query helpers.
 *
 * Imported AFTER schema.ts has created all tables. The barrel `../db.ts`
 * re-exports everything so existing `import { … } from '../db.js'` paths
 * continue to work unchanged.
 */

import type { Transaction } from 'better-sqlite3'
import { log } from '../logger.js'
import type { AgentRegistrationRow, FraudReportRow, LeaderboardRow, ScoreHistoryRow, ScoreRow, Tier } from '../types.js'
import { db } from './connection.js'

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

const stmtInsertDecay = db.prepare(`INSERT INTO score_decay (wallet, composite_score) VALUES (?, ?)`)
const stmtUpdateWalletIndex = db.prepare(`UPDATE wallet_index SET is_scored = 1, last_seen = ? WHERE wallet = ?`)
const stmtPruneHistory = db.prepare(
  `DELETE FROM score_history WHERE wallet = ? AND id NOT IN
   (SELECT id FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 50)`,
)

const stmtPruneDecay = db.prepare(
  `DELETE FROM score_decay WHERE wallet = ? AND rowid NOT IN (
    SELECT rowid FROM score_decay WHERE wallet = ? ORDER BY recorded_at DESC LIMIT 50
  )`,
)

const stmtPruneSnapshots = db.prepare(
  `DELETE FROM wallet_snapshots WHERE wallet = ? AND rowid NOT IN (
    SELECT rowid FROM wallet_snapshots WHERE wallet = ? ORDER BY snapshot_at DESC LIMIT 50
  )`,
)

/** Prune old wallet snapshots, keeping the 50 most recent. Call from the snapshot job, not from score upsert. */
export function pruneWalletSnapshots(wallet: string): void {
  stmtPruneSnapshots.run(wallet, wallet)
}

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

const stmtCountReportsAfter = db.prepare<[string, string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ? AND created_at > ?
`)

const stmtCountReporterReportsForTarget = db.prepare<[string, string], { count: number }>(`
  SELECT COUNT(*) as count FROM fraud_reports
  WHERE reporter_wallet = ? AND target_wallet = ?
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

// Threshold cache — refreshed every 60s so auto-recalibration adjustments
// propagate without a DB hit on every scoreToTier call.
let _tierThresholds = { Elite: 90, Trusted: 75, Established: 50, Emerging: 25 }
let _thresholdsCachedAt = 0

function refreshThresholds(): void {
  if (Date.now() - _thresholdsCachedAt < 60_000) return
  try {
    const raw = db.prepare('SELECT value FROM indexer_state WHERE key = ?').get('tier_threshold_adjustments') as
      | { value: string }
      | undefined
    if (raw?.value) {
      const parsed = JSON.parse(raw.value) as { thresholds: typeof _tierThresholds }
      if (parsed.thresholds) _tierThresholds = parsed.thresholds
    }
  } catch (err) {
    log.warn('db', 'Failed to parse tier_threshold_adjustments — using defaults', err)
  }
  _thresholdsCachedAt = Date.now()
}

export function scoreToTier(score: number): Tier {
  refreshThresholds()
  if (score >= _tierThresholds.Elite) return 'Elite'
  if (score >= _tierThresholds.Trusted) return 'Trusted'
  if (score >= _tierThresholds.Established) return 'Established'
  if (score >= _tierThresholds.Emerging) return 'Emerging'
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

  const normalizedWallet = wallet.toLowerCase()

  upsertScoreTxn(
    normalizedWallet,
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
    stmtInsertDecay.run(wallet, compositeScore)

    // Mark wallet as scored in wallet_index if it exists
    stmtUpdateWalletIndex.run(now.toISOString(), wallet)

    // Keep only last 50 history/decay entries per wallet
    stmtPruneHistory.run(wallet, wallet)
    stmtPruneDecay.run(wallet, wallet)
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

export function countReportsAfterDate(wallet: string, afterDate: string): number {
  return stmtCountReportsAfter.get(wallet, afterDate)!.count
}

export function countReporterReportsForTarget(reporter: string, target: string): number {
  return stmtCountReporterReportsForTarget.get(reporter, target)!.count
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
    .prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) as count FROM query_log
       WHERE requester_wallet = ?
         AND endpoint = '/v1/score/basic'
         AND is_free_tier = 1
         AND timestamp >= ?`,
    )
    .get(requesterKey, dayStart.toISOString())
  return row?.count ?? 0
}

export function countTotalQueryLogs(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM query_log').get()?.count ?? 0
}

// ---------- wallet_index helpers ----------

export function countIndexedWallets(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM wallet_index').get()?.count ?? 0
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
  const row = db
    .prepare<
      [string, string, string, string],
      {
        tx_count: number
        inflows: number
        outflows: number
        first_seen: string | null
        last_seen: string | null
      }
    >(`
    SELECT
      COUNT(*) as tx_count,
      COALESCE(SUM(CASE WHEN to_wallet = ? THEN amount_usdc ELSE 0 END), 0) as inflows,
      COALESCE(SUM(CASE WHEN from_wallet = ? THEN amount_usdc ELSE 0 END), 0) as outflows,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen
    FROM raw_transactions
    WHERE from_wallet = ? OR to_wallet = ?
  `)
    .get(w, w, w, w)

  return {
    x402TxCount: row?.tx_count ?? 0,
    x402InflowsUsd: row?.inflows ?? 0,
    x402OutflowsUsd: row?.outflows ?? 0,
    x402FirstSeen: row?.first_seen ?? null,
    x402LastSeen: row?.last_seen ?? null,
  }
}

/**
 * Count distinct counterparty wallets from raw_transactions.
 * A counterparty is any wallet that this wallet has sent to or received from.
 */
export function countUniqueCounterparties(wallet: string): number {
  const w = wallet.toLowerCase()
  const row = db
    .prepare<[string, string, string, string], { count: number }>(
      `SELECT COUNT(DISTINCT counterparty) as count FROM (
         SELECT to_wallet as counterparty FROM raw_transactions WHERE from_wallet = ?
         UNION
         SELECT from_wallet as counterparty FROM raw_transactions WHERE to_wallet = ?
       ) WHERE counterparty != ? AND counterparty != ?`,
    )
    .get(w, w, w, w)
  return row?.count ?? 0
}

/**
 * Service longevity: days between first and last transaction in raw_transactions.
 * Returns 0 if the wallet has fewer than 2 transactions.
 */
export function getServiceLongevityDays(wallet: string): number {
  const w = wallet.toLowerCase()
  const row = db
    .prepare<[string, string], { first_ts: string | null; last_ts: string | null }>(
      `SELECT MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
       FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ?`,
    )
    .get(w, w)
  if (!row?.first_ts || !row?.last_ts) return 0
  const days = (new Date(row.last_ts).getTime() - new Date(row.first_ts).getTime()) / 86_400_000
  return Math.round(days * 10) / 10
}

export function getWalletFirstX402Seen(wallet: string): string | null {
  const w = wallet.toLowerCase()
  const row = db
    .prepare<[string, string], { first_seen: string | null }>(
      `SELECT MIN(timestamp) as first_seen FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ?`,
    )
    .get(w, w)
  return row?.first_seen ?? null
}

export function getWalletIndexFirstSeen(wallet: string): string | null {
  const w = wallet.toLowerCase()
  try {
    const row = db
      .prepare<[string], { first_seen: string | null }>(`SELECT first_seen FROM wallet_index WHERE wallet = ?`)
      .get(w)
    return row?.first_seen ?? null
  } catch (err) {
    log.warn('db', `getWalletIndexFirstSeen query failed for ${w}`, err)
    return null
  }
}

export function countIndexedTransactions(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM raw_transactions').get()?.count ?? 0
}

export function countScoreOutcomes(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM score_outcomes').get()?.count ?? 0
}

export function countFraudReports(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM fraud_reports').get()?.count ?? 0
}

// ---------- indexer_state helpers ----------

export function getIndexerState(key: string): string | null {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM indexer_state WHERE key = ?').get(key)
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

export function countPriorQueries(wallet: string): number {
  const row = db
    .prepare<[string], { count: number }>(`SELECT COUNT(*) as count FROM query_log WHERE target_wallet = ?`)
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
  if (rows.length >= 10) return rows.map((r) => r.timestamp)
  // Fallback to raw_transactions (x402 indexer data)
  rows = db
    .prepare<[string, string], { timestamp: string }>(
      `SELECT timestamp FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp`,
    )
    .all(w, w)
  return rows.map((r) => r.timestamp)
}

// ---------- Revenue analytics ----------

export interface RevenueSummary {
  totalRevenue: number
  paidQueryCount: number
  freeQueryCount: number
  revenueByEndpoint: Array<{ endpoint: string; revenue: number; count: number }>
  revenueByDay: Array<{ date: string; revenue: number; count: number }>
}

export function getRevenueSummary(days: number): RevenueSummary {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const totals = db
    .prepare<[string], { revenue: number; paid: number; free: number }>(`
    SELECT
      COALESCE(SUM(price_paid), 0) as revenue,
      SUM(CASE WHEN is_free_tier = 0 AND price_paid > 0 THEN 1 ELSE 0 END) as paid,
      SUM(CASE WHEN is_free_tier = 1 THEN 1 ELSE 0 END) as free
    FROM query_log WHERE timestamp >= ?
  `)
    .get(since)!

  const byEndpoint = db
    .prepare<[string], { endpoint: string; revenue: number; count: number }>(`
    SELECT endpoint, COALESCE(SUM(price_paid), 0) as revenue, COUNT(*) as count
    FROM query_log WHERE timestamp >= ? AND price_paid > 0
    GROUP BY endpoint ORDER BY revenue DESC
  `)
    .all(since)

  const byDay = db
    .prepare<[string], { date: string; revenue: number; count: number }>(`
    SELECT DATE(timestamp) as date, COALESCE(SUM(price_paid), 0) as revenue, COUNT(*) as count
    FROM query_log WHERE timestamp >= ? AND price_paid > 0
    GROUP BY DATE(timestamp) ORDER BY date DESC
  `)
    .all(since)

  return {
    totalRevenue: totals.revenue,
    paidQueryCount: totals.paid,
    freeQueryCount: totals.free,
    revenueByEndpoint: byEndpoint,
    revenueByDay: byDay,
  }
}

export function getTopPayers(limit: number): Array<{
  wallet: string
  totalSpent: number
  queryCount: number
  lastSeen: string
}> {
  return db
    .prepare<[number], { wallet: string; totalSpent: number; queryCount: number; lastSeen: string }>(`
    SELECT requester_wallet as wallet,
           COALESCE(SUM(price_paid), 0) as totalSpent,
           COUNT(*) as queryCount,
           MAX(timestamp) as lastSeen
    FROM query_log
    WHERE requester_wallet IS NOT NULL AND price_paid > 0
    GROUP BY requester_wallet
    ORDER BY totalSpent DESC
    LIMIT ?
  `)
    .all(limit)
}

export function getRevenueByHour(): Array<{
  hour: string
  revenue: number
  count: number
}> {
  return db
    .prepare<[], { hour: string; revenue: number; count: number }>(`
    SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) as hour,
           COALESCE(SUM(price_paid), 0) as revenue,
           COUNT(*) as count
    FROM query_log
    WHERE timestamp >= datetime('now', '-24 hours') AND price_paid > 0
    GROUP BY strftime('%Y-%m-%dT%H:00:00Z', timestamp)
    ORDER BY hour DESC
  `)
    .all()
}

// ---------- Economy metrics ----------

export interface EconomyMetricsRow {
  period_start: string
  period_end: string
  period_type: string
  total_wallets: number
  new_wallets: number
  dead_wallets: number
  active_wallets: number
  total_tx_count: number
  total_volume: number
  avg_tx_size: number
  median_score: number
  avg_score: number
  elite_count: number
  trusted_count: number
  established_count: number
  emerging_count: number
  unverified_count: number
  total_fraud_reports: number
  total_queries: number
}

export function getEconomyMetrics(periodType: string, limit: number): EconomyMetricsRow[] {
  return db
    .prepare<[string, number], EconomyMetricsRow>(`
    SELECT * FROM economy_metrics
    WHERE period_type = ?
    ORDER BY period_start DESC
    LIMIT ?
  `)
    .all(periodType, limit)
}

export const indexTransferBatch: Transaction<(transfers: IndexedTransfer[]) => void> = db.transaction(
  (transfers: IndexedTransfer[]) => {
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
  },
)

// ---------- ERC-8004 Reputation Publications ----------

export interface ReputationPublication {
  wallet: string
  composite_score: number
  model_version: string
  tx_hash: string | null
  published_at: string
}

const stmtGetPublication = db.prepare<[string], ReputationPublication>(
  `SELECT * FROM reputation_publications WHERE wallet = ?`,
)

const stmtUpsertPublication = db.prepare(`
  INSERT INTO reputation_publications (wallet, composite_score, model_version, tx_hash, published_at)
  VALUES (@wallet, @composite_score, @model_version, @tx_hash, @published_at)
  ON CONFLICT(wallet) DO UPDATE SET
    composite_score = excluded.composite_score,
    model_version   = excluded.model_version,
    tx_hash         = excluded.tx_hash,
    published_at    = excluded.published_at
`)

export function getPublication(wallet: string): ReputationPublication | undefined {
  return stmtGetPublication.get(wallet)
}

export function upsertPublication(pub: {
  wallet: string
  composite_score: number
  model_version: string
  tx_hash: string | null
}) {
  stmtUpsertPublication.run({
    wallet: pub.wallet,
    composite_score: pub.composite_score,
    model_version: pub.model_version,
    tx_hash: pub.tx_hash,
    published_at: new Date().toISOString(),
  })
}

/**
 * Find scores eligible for on-chain publication:
 * - Confidence above the minimum threshold
 * - Score has changed by at least `scoreDelta` since last publication (or never published)
 */
export function getScoresNeedingPublication(minConfidence: number, scoreDelta: number, limit: number): ScoreRow[] {
  return db
    .prepare<[number, number, number], ScoreRow>(
      `SELECT s.* FROM scores s
       LEFT JOIN reputation_publications rp ON rp.wallet = s.wallet
       WHERE s.confidence >= ?
         AND (rp.wallet IS NULL OR ABS(s.composite_score - rp.composite_score) >= ?)
       ORDER BY s.confidence DESC
       LIMIT ?`,
    )
    .all(minConfidence, scoreDelta, limit)
}
