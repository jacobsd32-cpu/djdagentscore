import { getEconomyMetrics, getEcosystemStats, getRecentActivity } from '../db.js'
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
