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
    process.env.ADMIN_KEY = 'test-admin-key-that-is-long-enough-for-validation'
    delete process.env.DJD_RUNTIME_MODE
    delete process.env.DJD_RELEASE_SHA
    delete process.env.DJD_BUILD_TIMESTAMP
    delete process.env.ENABLE_BLOCKCHAIN_INDEXER
    delete process.env.ENABLE_USDC_INDEXER
    delete process.env.ENABLE_HOURLY_REFRESH
    delete process.env.GITHUB_TOKEN
    delete process.env.PUBLISHER_PRIVATE_KEY

    const { resetHealthPayloadCache } = await import('../../src/services/opsService.js')
    resetHealthPayloadCache()
  })

  it('returns minimal public response without admin key', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health')
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe(MODEL_VERSION)
    expect(body.version).toBe('2.5.0')
    expect(body.uptime).toBeTypeOf('number')
    expect(body.modelVersion).toBeUndefined()
    expect(body.database).toBeUndefined()
    expect(body.indexer).toBeUndefined()
    expect(body.jobs).toBeUndefined()
    expect(body.release).toBeUndefined()
    expect(state.countCachedScores).not.toHaveBeenCalled()
  })

  it('returns detailed response with admin key', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.modelVersion).toBe(MODEL_VERSION)
    expect(body.modelVersion).toBe('2.5.0')
    expect(body.uptime).toBe(123)
    expect(body.warnings).toEqual([
      {
        code: 'github_token_missing',
        message: 'GITHUB_TOKEN not set — GitHub verification is limited to unauthenticated rate limits.',
      },
      {
        code: 'publisher_private_key_missing',
        message: 'PUBLISHER_PRIVATE_KEY not set — ERC-8004 on-chain publication is disabled.',
      },
    ])
    expect(body.runtime).toEqual({
      mode: 'combined',
      apiEnabled: true,
      workerEnabled: true,
      workerJobs: {
        blockchainIndexer: {
          configured: true,
          active: true,
        },
        usdcTransferIndexer: {
          configured: true,
          active: true,
        },
        hourlyRefresh: {
          configured: true,
          active: true,
        },
      },
    })
    expect(body.integrations).toEqual({
      githubVerification: {
        authenticated: false,
        mode: 'unauthenticated',
        rateLimitPerHour: 60,
      },
      erc8004Publisher: {
        configured: false,
        active: false,
      },
    })
    expect(body.database).toBeDefined()
    expect(body.indexer).toBeDefined()
    expect(body.jobs).toBeDefined()
    expect(body.release).toBeUndefined()
    expect(state.countCachedScores).toHaveBeenCalledTimes(1)
  })

  it('reuses the cached public payload while refreshing uptime', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const firstRes = await app.request('/health')
    expect(firstRes.status).toBe(200)
    const firstBody = await firstRes.json()
    expect(firstBody.uptime).toBe(123)
    expect(firstBody.database).toBeUndefined()

    state.uptimeSeconds.mockReturnValue(456)

    const secondRes = await app.request('/health')
    expect(secondRes.status).toBe(200)
    const secondBody = await secondRes.json()
    expect(secondBody.uptime).toBe(456)
    expect(secondBody.database).toBeUndefined()
    expect(state.countCachedScores).not.toHaveBeenCalled()
  })

  it('includes release metadata when build identifiers are present', async () => {
    process.env.DJD_RELEASE_SHA = 'ABCDEF1234567890'
    process.env.DJD_BUILD_TIMESTAMP = '2026-03-13T02:30:00Z'

    const { resetHealthPayloadCache } = await import('../../src/services/opsService.js')
    resetHealthPayloadCache()

    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const publicRes = await app.request('/health')
    const publicBody = await publicRes.json()
    expect(publicBody.release).toEqual({
      sha: 'abcdef1234567890',
      shaShort: 'abcdef1',
      builtAt: '2026-03-13T02:30:00Z',
    })

    const adminRes = await app.request('/health', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    const adminBody = await adminRes.json()
    expect(adminBody.release).toEqual({
      sha: 'abcdef1234567890',
      shaShort: 'abcdef1',
      builtAt: '2026-03-13T02:30:00Z',
    })
  })

  it('reports worker jobs disabled by config without treating them as broken', async () => {
    process.env.ENABLE_USDC_INDEXER = 'false'
    process.env.ENABLE_HOURLY_REFRESH = 'no'

    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    const body = await res.json()

    expect(body.runtime.workerJobs).toEqual({
      blockchainIndexer: {
        configured: true,
        active: true,
      },
      usdcTransferIndexer: {
        configured: false,
        active: false,
      },
      hourlyRefresh: {
        configured: false,
        active: false,
      },
    })
  })

  it('reports authenticated GitHub verification and active publisher when configured', async () => {
    process.env.GITHUB_TOKEN = 'github-token'
    process.env.PUBLISHER_PRIVATE_KEY = '0xabc123'

    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    const body = await res.json()

    expect(body.warnings).toEqual([])
    expect(body.integrations).toEqual({
      githubVerification: {
        authenticated: true,
        mode: 'authenticated',
        rateLimitPerHour: 5000,
      },
      erc8004Publisher: {
        configured: true,
        active: true,
      },
    })
  })
})
