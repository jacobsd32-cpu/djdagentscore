import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  countCachedScores: vi.fn().mockReturnValue(7),
  countIndexedWallets: vi.fn().mockReturnValue(11),
  countTotalQueryLogs: vi.fn().mockReturnValue(13),
  countRegisteredAgents: vi.fn().mockReturnValue(5),
  countFraudReports: vi.fn().mockReturnValue(2),
  getHttpCounters: vi.fn().mockReturnValue(['djd_http_requests_total{method="GET",path="/health",status="200"} 4']),
  uptimeSeconds: vi.fn().mockReturnValue(321),
}))

vi.mock('../../src/db.js', () => ({
  countCachedScores: (...args: unknown[]) => state.countCachedScores(...args),
  countIndexedWallets: (...args: unknown[]) => state.countIndexedWallets(...args),
  countTotalQueryLogs: (...args: unknown[]) => state.countTotalQueryLogs(...args),
  countRegisteredAgents: (...args: unknown[]) => state.countRegisteredAgents(...args),
  countFraudReports: (...args: unknown[]) => state.countFraudReports(...args),
  countIndexedTransactions: vi.fn(),
  countScoreOutcomes: vi.fn(),
}))

vi.mock('../../src/metrics.js', () => ({
  getHttpCounters: (...args: unknown[]) => state.getHttpCounters(...args),
  uptimeSeconds: (...args: unknown[]) => state.uptimeSeconds(...args),
}))

vi.mock('../../src/jobs/blockchainIndexer.js', () => ({
  getIndexerStatus: vi.fn(),
}))

vi.mock('../../src/jobs/jobStats.js', () => ({
  jobStats: {
    hourlyRefresh: { lastRun: null, walletsRefreshed: 0 },
    intentMatcher: { lastRun: null, queriesProcessed: 0 },
    outcomeMatcher: { lastRun: null, outcomesRecorded: 0 },
    anomalyDetector: { lastRun: null, anomaliesFound: 0 },
    dailyAggregator: { lastRun: null },
  },
}))

describe('GET /metrics', () => {
  beforeEach(() => {
    state.countCachedScores.mockReset()
    state.countIndexedWallets.mockReset()
    state.countTotalQueryLogs.mockReset()
    state.countRegisteredAgents.mockReset()
    state.countFraudReports.mockReset()
    state.getHttpCounters.mockReset()
    state.uptimeSeconds.mockReset()

    state.countCachedScores.mockReturnValue(7)
    state.countIndexedWallets.mockReturnValue(11)
    state.countTotalQueryLogs.mockReturnValue(13)
    state.countRegisteredAgents.mockReturnValue(5)
    state.countFraudReports.mockReturnValue(2)
    state.getHttpCounters.mockReturnValue(['djd_http_requests_total{method="GET",path="/health",status="200"} 4'])
    state.uptimeSeconds.mockReturnValue(321)
  })

  it('returns Prometheus exposition text for runtime and database metrics', async () => {
    const { Hono } = await import('hono')
    const { default: metricsRoute } = await import('../../src/routes/metrics.js')

    const app = new Hono()
    app.route('/metrics', metricsRoute)

    const res = await app.request('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('cache-control')).toBe('no-cache')

    const body = await res.text()
    expect(body).toContain('# HELP djd_http_requests_total')
    expect(body).toContain('djd_http_requests_total{method="GET",path="/health",status="200"} 4')
    expect(body).toContain('djd_scores_cached 7')
    expect(body).toContain('djd_wallets_indexed 11')
    expect(body).toContain('djd_queries_total 13')
    expect(body).toContain('djd_registrations_total 5')
    expect(body).toContain('djd_reports_total 2')
    expect(body).toContain('djd_process_uptime_seconds 321')
    expect(body).toContain('djd_process_rss_bytes ')
  })
})
