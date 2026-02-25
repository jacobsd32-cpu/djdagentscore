import { describe, expect, it, vi } from 'vitest'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

vi.mock('../../src/db.js', () => ({
  countCachedScores: vi.fn().mockReturnValue(0),
  countIndexedWallets: vi.fn().mockReturnValue(0),
  countIndexedTransactions: vi.fn().mockReturnValue(0),
  countScoreOutcomes: vi.fn().mockReturnValue(0),
  countTotalQueryLogs: vi.fn().mockReturnValue(0),
  countFraudReports: vi.fn().mockReturnValue(0),
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

describe('GET /health', () => {
  it('returns the canonical MODEL_VERSION', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health')
    const body = await res.json()
    expect(body.modelVersion).toBe(MODEL_VERSION)
    expect(body.modelVersion).toBe('2.1.0')
  })
})
