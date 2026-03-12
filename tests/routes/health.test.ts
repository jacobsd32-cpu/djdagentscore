import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

const state = vi.hoisted(() => ({
  countCachedScores: vi.fn().mockReturnValue(0),
  countIndexedWallets: vi.fn().mockReturnValue(0),
  countIndexedTransactions: vi.fn().mockReturnValue(0),
  countScoreOutcomes: vi.fn().mockReturnValue(0),
  countTotalQueryLogs: vi.fn().mockReturnValue(0),
  countFraudReports: vi.fn().mockReturnValue(0),
  uptimeSeconds: vi.fn().mockReturnValue(123),
}))

vi.mock('../../src/db.js', () => ({
  countCachedScores: (...args: unknown[]) => state.countCachedScores(...args),
  countIndexedWallets: (...args: unknown[]) => state.countIndexedWallets(...args),
  countIndexedTransactions: (...args: unknown[]) => state.countIndexedTransactions(...args),
  countScoreOutcomes: (...args: unknown[]) => state.countScoreOutcomes(...args),
  countTotalQueryLogs: (...args: unknown[]) => state.countTotalQueryLogs(...args),
  countFraudReports: (...args: unknown[]) => state.countFraudReports(...args),
  countRegisteredAgents: vi.fn().mockReturnValue(0),
}))

vi.mock('../../src/jobs/blockchainIndexer.js', () => ({
  getIndexerStatus: vi.fn().mockReturnValue({ lastBlockIndexed: 0, running: false }),
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

vi.mock('../../src/metrics.js', () => ({
  getHttpCounters: vi.fn().mockReturnValue([]),
  uptimeSeconds: (...args: unknown[]) => state.uptimeSeconds(...args),
}))

describe('GET /health', () => {
  beforeEach(async () => {
    state.countCachedScores.mockReset()
    state.countIndexedWallets.mockReset()
    state.countIndexedTransactions.mockReset()
    state.countScoreOutcomes.mockReset()
    state.countTotalQueryLogs.mockReset()
    state.countFraudReports.mockReset()
    state.uptimeSeconds.mockReset()

    state.countCachedScores.mockReturnValue(0)
    state.countIndexedWallets.mockReturnValue(0)
    state.countIndexedTransactions.mockReturnValue(0)
    state.countScoreOutcomes.mockReturnValue(0)
    state.countTotalQueryLogs.mockReturnValue(0)
    state.countFraudReports.mockReturnValue(0)
    state.uptimeSeconds.mockReturnValue(123)

    const { resetHealthPayloadCache } = await import('../../src/services/opsService.js')
    resetHealthPayloadCache()
  })

  it('returns the canonical MODEL_VERSION', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health')
    const body = await res.json()
    expect(body.modelVersion).toBe(MODEL_VERSION)
    expect(body.modelVersion).toBe('2.5.0')
    expect(body.uptime).toBe(123)
  })

  it('reuses the cached payload while refreshing uptime', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const firstRes = await app.request('/health')
    expect(firstRes.status).toBe(200)
    const firstBody = await firstRes.json()
    expect(firstBody.uptime).toBe(123)

    state.uptimeSeconds.mockReturnValue(456)

    const secondRes = await app.request('/health')
    expect(secondRes.status).toBe(200)
    const secondBody = await secondRes.json()
    expect(secondBody.uptime).toBe(456)
    expect(state.countCachedScores).toHaveBeenCalledTimes(1)
  })
})
