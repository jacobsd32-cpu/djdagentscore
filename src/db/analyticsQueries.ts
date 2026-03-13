import type { ScoreRow } from '../types.js'
import { db } from './connection.js'

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

  const revenueByEndpoint = db
    .prepare<[string], { endpoint: string; revenue: number; count: number }>(`
      SELECT endpoint, COALESCE(SUM(price_paid), 0) as revenue, COUNT(*) as count
      FROM query_log WHERE timestamp >= ? AND price_paid > 0
      GROUP BY endpoint ORDER BY revenue DESC
    `)
    .all(since)

  const revenueByDay = db
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
    revenueByEndpoint,
    revenueByDay,
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

export interface EconomySurvivalSummaryRow {
  total_wallets: number
  active_7d: number
  active_30d: number
  dormant_30d: number
  avg_days_since_last_seen: number | null
}

export interface EconomySurvivalCohortRow {
  horizon_days: number
  eligible_wallets: number
  surviving_wallets: number
}

export interface EconomyTierSurvivalRow {
  tier: string
  wallet_count: number
  active_30d: number
}

export interface EconomyAtRiskWalletRow {
  wallet: string
  current_score: number | null
  current_tier: string | null
  first_seen: string | null
  last_seen: string | null
  days_since_last_seen: number | null
  score_change_30d: number | null
}

export function getEconomySurvivalSummary(): EconomySurvivalSummaryRow {
  const row = db
    .prepare<[], EconomySurvivalSummaryRow>(`
      SELECT
        COUNT(*) as total_wallets,
        COALESCE(SUM(CASE WHEN datetime(last_seen) >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) as active_7d,
        COALESCE(SUM(CASE WHEN datetime(last_seen) >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) as active_30d,
        COALESCE(SUM(CASE WHEN datetime(last_seen) < datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) as dormant_30d,
        ROUND(AVG(julianday('now') - julianday(last_seen)), 1) as avg_days_since_last_seen
      FROM wallet_index
    `)
    .get()

  return (
    row ?? {
      total_wallets: 0,
      active_7d: 0,
      active_30d: 0,
      dormant_30d: 0,
      avg_days_since_last_seen: null,
    }
  )
}

export function getEconomySurvivalCohort(horizonDays: number): EconomySurvivalCohortRow {
  const modifier = `-${Math.max(1, horizonDays)} days`
  const row = db
    .prepare<[number, string, string], EconomySurvivalCohortRow>(`
      SELECT
        ? as horizon_days,
        COUNT(*) as eligible_wallets,
        COALESCE(SUM(CASE WHEN datetime(last_seen) >= datetime('now', ?) THEN 1 ELSE 0 END), 0) as surviving_wallets
      FROM wallet_index
      WHERE datetime(first_seen) <= datetime('now', ?)
    `)
    .get(horizonDays, modifier, modifier)

  return (
    row ?? {
      horizon_days: horizonDays,
      eligible_wallets: 0,
      surviving_wallets: 0,
    }
  )
}

export function listEconomyTierSurvival(): EconomyTierSurvivalRow[] {
  return db
    .prepare<[], EconomyTierSurvivalRow>(`
      SELECT
        COALESCE(s.tier, 'Unverified') as tier,
        COUNT(*) as wallet_count,
        COALESCE(SUM(CASE WHEN datetime(wi.last_seen) >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) as active_30d
      FROM wallet_index wi
      LEFT JOIN scores s ON s.wallet = wi.wallet
      GROUP BY COALESCE(s.tier, 'Unverified')
      ORDER BY wallet_count DESC, tier ASC
    `)
    .all()
}

export function listEconomyAtRiskWallets(limit: number): EconomyAtRiskWalletRow[] {
  return db
    .prepare<[number], EconomyAtRiskWalletRow>(`
      WITH recent_decay AS (
        SELECT
          wallet,
          MAX(CASE WHEN rn_desc = 1 THEN composite_score END) as latest_score,
          MAX(CASE WHEN rn_asc = 1 THEN composite_score END) as earliest_score
        FROM (
          SELECT
            wallet,
            composite_score,
            recorded_at,
            ROW_NUMBER() OVER (PARTITION BY wallet ORDER BY recorded_at DESC) as rn_desc,
            ROW_NUMBER() OVER (PARTITION BY wallet ORDER BY recorded_at ASC) as rn_asc
          FROM score_decay
          WHERE datetime(recorded_at) >= datetime('now', '-30 days')
        ) decay_ranked
        GROUP BY wallet
      )
      SELECT
        wi.wallet,
        s.composite_score as current_score,
        s.tier as current_tier,
        wi.first_seen,
        wi.last_seen,
        ROUND(julianday('now') - julianday(wi.last_seen), 1) as days_since_last_seen,
        COALESCE(recent_decay.latest_score - recent_decay.earliest_score, 0) as score_change_30d
      FROM wallet_index wi
      LEFT JOIN recent_decay ON recent_decay.wallet = wi.wallet
      LEFT JOIN scores s ON s.wallet = wi.wallet
      WHERE datetime(wi.last_seen) < datetime('now', '-7 days')
         OR COALESCE(recent_decay.latest_score - recent_decay.earliest_score, 0) <= -10
      ORDER BY
        CASE WHEN datetime(wi.last_seen) < datetime('now', '-30 days') THEN 0 ELSE 1 END,
        score_change_30d ASC,
        wi.last_seen ASC
      LIMIT ?
    `)
    .all(limit)
}

export interface EcosystemStats {
  totalWalletsScored: number
  totalWalletsIndexed: number
  totalTransactions: number
  totalRegistered: number
  avgScore: number
  medianScore: number
  tierDistribution: Record<string, number>
  scoreHistogram: Array<{ bucket: string; count: number }>
}

export function getEcosystemStats(): EcosystemStats {
  const totalWalletsScored = db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM scores').get()!.count
  const totalWalletsIndexed = db
    .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM wallet_index')
    .get()!.count
  const totalTransactions = db
    .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM raw_transactions')
    .get()!.count
  const totalRegistered = db
    .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM agent_registrations')
    .get()!.count

  const averages = db
    .prepare<[], { avg_score: number; median_score: number }>(`
      SELECT
        COALESCE(AVG(composite_score), 0) as avg_score,
        COALESCE((SELECT composite_score FROM scores ORDER BY composite_score LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM scores)), 0) as median_score
      FROM scores
    `)
    .get()!

  const tierRows = db
    .prepare<[], { tier: string; count: number }>('SELECT tier, COUNT(*) as count FROM scores GROUP BY tier')
    .all()
  const tierDistribution: Record<string, number> = {}
  for (const row of tierRows) {
    tierDistribution[row.tier] = row.count
  }

  const histogramRows = db
    .prepare<[], { bucket: number; count: number }>(`
      SELECT (composite_score / 10) * 10 as bucket, COUNT(*) as count
      FROM scores
      GROUP BY bucket
      ORDER BY bucket
    `)
    .all()

  return {
    totalWalletsScored,
    totalWalletsIndexed,
    totalTransactions,
    totalRegistered,
    avgScore: Math.round(averages.avg_score * 10) / 10,
    medianScore: averages.median_score,
    tierDistribution,
    scoreHistogram: histogramRows.map((row) => ({
      bucket: row.bucket >= 90 ? '90-100' : `${row.bucket}-${row.bucket + 9}`,
      count: row.count,
    })),
  }
}

export interface ActivityEntry {
  type: 'score_change' | 'registration' | 'fraud_report'
  wallet: string
  timestamp: string
  detail: string
}

export function getRecentActivity(limit: number): ActivityEntry[] {
  const activities: ActivityEntry[] = []

  const scoreChanges = db
    .prepare<[number], { wallet: string; score: number; calculated_at: string }>(`
      SELECT wallet, score, calculated_at
      FROM score_history
      ORDER BY calculated_at DESC
      LIMIT ?
    `)
    .all(limit)
  for (const row of scoreChanges) {
    activities.push({
      type: 'score_change',
      wallet: row.wallet,
      timestamp: row.calculated_at,
      detail: `Score updated to ${row.score}`,
    })
  }

  const registrations = db
    .prepare<[number], { wallet: string; name: string | null; registered_at: string }>(`
      SELECT wallet, name, registered_at FROM agent_registrations
      ORDER BY registered_at DESC
      LIMIT ?
    `)
    .all(limit)
  for (const row of registrations) {
    activities.push({
      type: 'registration',
      wallet: row.wallet,
      timestamp: row.registered_at,
      detail: row.name ? `Agent "${row.name}" registered` : 'New agent registered',
    })
  }

  const reports = db
    .prepare<[number], { target_wallet: string; reason: string; created_at: string }>(`
      SELECT target_wallet, reason, created_at FROM fraud_reports
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit)
  for (const row of reports) {
    activities.push({
      type: 'fraud_report',
      wallet: row.target_wallet,
      timestamp: row.created_at,
      detail: `Fraud report: ${row.reason}`,
    })
  }

  activities.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
  return activities.slice(0, limit)
}

export interface EndpointStat {
  endpoint: string
  count: number
}

export interface DailyVolume {
  date: string
  count: number
}

export interface ApiKeyAnalytics {
  totalRequests: number
  endpointBreakdown: EndpointStat[]
  dailyVolume: DailyVolume[]
  topWallets: Array<{ wallet: string; count: number }>
}

export function getApiKeyAnalytics(wallet: string, days: number): ApiKeyAnalytics {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const totalRequests =
    db
      .prepare<[string, string], { count: number }>(
        'SELECT COUNT(*) as count FROM query_log WHERE requester_wallet = ? AND timestamp > ?',
      )
      .get(wallet, cutoff)?.count ?? 0

  const endpointBreakdown = db
    .prepare<[string, string], EndpointStat>(
      `SELECT endpoint, COUNT(*) as count FROM query_log
       WHERE requester_wallet = ? AND timestamp > ?
       GROUP BY endpoint ORDER BY count DESC LIMIT 10`,
    )
    .all(wallet, cutoff)

  const dailyVolume = db
    .prepare<[string, string], DailyVolume>(
      `SELECT DATE(timestamp) as date, COUNT(*) as count FROM query_log
       WHERE requester_wallet = ? AND timestamp > ?
       GROUP BY DATE(timestamp) ORDER BY date ASC`,
    )
    .all(wallet, cutoff)

  const topWallets = db
    .prepare<[string, string], { wallet: string; count: number }>(
      `SELECT target_wallet as wallet, COUNT(*) as count FROM query_log
       WHERE requester_wallet = ? AND timestamp > ? AND target_wallet IS NOT NULL
       GROUP BY target_wallet ORDER BY count DESC LIMIT 10`,
    )
    .all(wallet, cutoff)

  return { totalRequests, endpointBreakdown, dailyVolume, topWallets }
}

export interface ReputationPublication {
  wallet: string
  composite_score: number
  model_version: string
  tx_hash: string | null
  published_at: string
}

const stmtGetPublication = db.prepare<[string], ReputationPublication>(`
  SELECT wallet, composite_score, model_version, tx_hash, published_at
  FROM reputation_publications
  WHERE wallet = ?
`)

const stmtUpsertPublication = db.prepare(`
  INSERT INTO reputation_publications (wallet, composite_score, model_version, tx_hash, published_at)
  VALUES (@wallet, @composite_score, @model_version, @tx_hash, @published_at)
  ON CONFLICT(wallet) DO UPDATE SET
    composite_score = excluded.composite_score,
    model_version   = excluded.model_version,
    tx_hash         = excluded.tx_hash,
    published_at    = excluded.published_at
`)

export function upsertPublication(pub: {
  wallet: string
  composite_score: number
  model_version: string
  tx_hash: string | null
}): void {
  stmtUpsertPublication.run({
    wallet: pub.wallet,
    composite_score: pub.composite_score,
    model_version: pub.model_version,
    tx_hash: pub.tx_hash,
    published_at: new Date().toISOString(),
  })
}

export function getReputationPublication(wallet: string): ReputationPublication | undefined {
  return stmtGetPublication.get(wallet)
}

export function getScoresNeedingPublication(minConfidence: number, scoreDelta: number, limit: number): ScoreRow[] {
  return db
    .prepare<[number, number, number], ScoreRow>(`
      SELECT s.* FROM scores s
      LEFT JOIN reputation_publications rp ON rp.wallet = s.wallet
      WHERE s.confidence >= ?
        AND (rp.wallet IS NULL OR ABS(s.composite_score - rp.composite_score) >= ?)
      ORDER BY s.confidence DESC
      LIMIT ?
    `)
    .all(minConfidence, scoreDelta, limit)
}
