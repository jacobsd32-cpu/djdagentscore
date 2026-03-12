import {
  getEconomyMetrics,
  getEconomySurvivalCohort,
  getEconomySurvivalSummary,
  getEcosystemStats,
  getRecentActivity,
  listEconomyAtRiskWallets,
  listEconomyTierSurvival,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { explorerDashboardHtml } from '../templates/explorer.js'

const VALID_PERIODS = ['daily', 'weekly', 'monthly'] as const
const DEFAULT_ECONOMY_LIMIT = 30
const MAX_ECONOMY_LIMIT = 90
const DEFAULT_ACTIVITY_LIMIT = 20
const MAX_ACTIVITY_LIMIT = 50

type EconomyPeriod = (typeof VALID_PERIODS)[number]

interface AnalyticsServiceError {
  ok: false
  code: string
  message: string
  status: 400
}

interface AnalyticsServiceSuccess<T> {
  ok: true
  data: T
}

export type AnalyticsServiceResult<T> = AnalyticsServiceError | AnalyticsServiceSuccess<T>

function parseClampedLimit(rawLimit: string | undefined, defaultLimit: number, maxLimit: number): number {
  const parsed = Number.parseInt(rawLimit ?? String(defaultLimit), 10)
  if (Number.isNaN(parsed)) return defaultLimit
  return Math.min(Math.max(parsed, 1), maxLimit)
}

export function getEconomyDashboard(
  rawPeriod: string | undefined,
  rawLimit: string | undefined,
): AnalyticsServiceResult<{
  period: EconomyPeriod
  limit: number
  count: number
  metrics: ReturnType<typeof getEconomyMetrics>
}> {
  const period = (rawPeriod ?? 'daily') as EconomyPeriod
  if (!VALID_PERIODS.includes(period)) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_PERIOD,
      message: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`,
      status: 400,
    }
  }

  const limit = parseClampedLimit(rawLimit, DEFAULT_ECONOMY_LIMIT, MAX_ECONOMY_LIMIT)
  const metrics = getEconomyMetrics(period, limit)

  return {
    ok: true,
    data: {
      period,
      limit,
      count: metrics.length,
      metrics,
    },
  }
}

export function getEconomyVolumeView(
  rawPeriod: string | undefined,
  rawLimit: string | undefined,
): AnalyticsServiceResult<{
  period: EconomyPeriod
  limit: number
  count: number
  series: Array<{
    period_start: string
    period_end: string
    total_tx_count: number
    total_volume: number
    avg_tx_size: number
    active_wallets: number
    new_wallets: number
  }>
}> {
  const base = getEconomyDashboard(rawPeriod, rawLimit)
  if (!base.ok) return base

  return {
    ok: true,
    data: {
      period: base.data.period,
      limit: base.data.limit,
      count: base.data.count,
      series: base.data.metrics.map((metric) => ({
        period_start: metric.period_start,
        period_end: metric.period_end,
        total_tx_count: metric.total_tx_count,
        total_volume: metric.total_volume,
        avg_tx_size: metric.avg_tx_size,
        active_wallets: metric.active_wallets,
        new_wallets: metric.new_wallets,
      })),
    },
  }
}

export function getEconomySurvivalView(
  rawLimit: string | undefined,
): AnalyticsServiceResult<{
  as_of: string
  summary: {
    total_wallets: number
    active_7d: number
    active_30d: number
    dormant_30d: number
    avg_days_since_last_seen: number | null
  }
  cohorts: Array<{
    horizon_days: number
    eligible_wallets: number
    surviving_wallets: number
    survival_rate: number
  }>
  by_tier: Array<{
    tier: string
    wallet_count: number
    active_30d: number
    survival_rate_30d: number
  }>
  at_risk_wallets: Array<{
    wallet: string
    current_score: number | null
    current_tier: string | null
    first_seen: string | null
    last_seen: string | null
    days_since_last_seen: number | null
    score_change_30d: number | null
    risk_bucket: 'declining' | 'dormant'
  }>
  returned: number
}> {
  const limit = parseClampedLimit(rawLimit, 20, 100)
  const summary = getEconomySurvivalSummary()
  const cohorts = [7, 30, 90].map((horizonDays) => {
    const row = getEconomySurvivalCohort(horizonDays)
    return {
      horizon_days: row.horizon_days,
      eligible_wallets: row.eligible_wallets,
      surviving_wallets: row.surviving_wallets,
      survival_rate:
        row.eligible_wallets > 0 ? Math.round((row.surviving_wallets / row.eligible_wallets) * 1000) / 10 : 0,
    }
  })

  const byTier = listEconomyTierSurvival().map((row) => ({
    tier: row.tier,
    wallet_count: row.wallet_count,
    active_30d: row.active_30d,
    survival_rate_30d: row.wallet_count > 0 ? Math.round((row.active_30d / row.wallet_count) * 1000) / 10 : 0,
  }))

  const atRiskWallets = listEconomyAtRiskWallets(limit).map((row) => ({
    wallet: row.wallet,
    current_score: row.current_score,
    current_tier: row.current_tier,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    days_since_last_seen: row.days_since_last_seen,
    score_change_30d: row.score_change_30d,
    risk_bucket: (row.days_since_last_seen ?? 0) > 30 ? ('dormant' as const) : ('declining' as const),
  }))

  return {
    ok: true,
    data: {
      as_of: new Date().toISOString(),
      summary,
      cohorts,
      by_tier: byTier,
      at_risk_wallets: atRiskWallets,
      returned: atRiskWallets.length,
    },
  }
}

export function getExplorerDashboardPage(): { html: string } {
  const stats = getEcosystemStats()
  return {
    html: explorerDashboardHtml(stats),
  }
}

export function getExplorerStatsSnapshot() {
  return getEcosystemStats()
}

export function getExplorerActivityFeed(rawLimit: string | undefined): {
  activity: ReturnType<typeof getRecentActivity>
} {
  const limit = parseClampedLimit(rawLimit, DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT)
  return {
    activity: getRecentActivity(limit),
  }
}
