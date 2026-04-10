import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getPrometheusMetricsPayload: vi
    .fn()
    .mockReturnValue(
      '# HELP djd_http_requests_total Total HTTP requests\n' +
        'djd_http_requests_total{method="GET",path="/health",status="200"} 4',
    ),
  getHealthPayload: vi.fn().mockImplementation((detailed: boolean) => {
    if (detailed) {
      return {
        status: 'ok',
        version: '2.5.0',
        uptime: 123,
        modelVersion: '2.5.0',
        experimentalStatus: true,
        warnings: [
          {
            code: 'example_warning',
            message: 'example detailed warning',
          },
        ],
        runtime: {
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
        },
        integrations: {
          githubVerification: {
            authenticated: false,
            mode: 'unauthenticated',
            rateLimitPerHour: 60,
          },
          erc8004Publisher: {
            configured: false,
            active: false,
          },
          evaluatorOracleSigner: {
            configured: false,
            active: false,
            source: 'unconfigured',
            address: null,
          },
        },
        database: {
          cachedScores: 0,
          indexedWallets: 0,
          totalTransactionsIndexed: 0,
          totalFraudReports: 0,
          totalQueryLogEntries: 0,
          totalOutcomesTracked: 0,
        },
        indexer: {
          lastBlockIndexed: 0,
          running: false,
        },
        jobs: {
          hourlyRefresh: {
            lastRun: null,
            walletsRefreshed: 0,
          },
          intentMatcher: {
            lastRun: null,
            queriesProcessed: 0,
          },
          outcomeMatcher: {
            lastRun: null,
            outcomesRecorded: 0,
          },
          anomalyDetector: {
            lastRun: null,
            anomaliesFound: 0,
          },
          dailyAggregator: {
            lastRun: null,
          },
        },
      }
    }

    return {
      status: 'ok',
      version: '2.5.0',
      uptime: 123,
    }
  }),
}))

vi.mock('../../src/services/opsService.js', () => ({
  getPrometheusMetricsPayload: (...args: unknown[]) => state.getPrometheusMetricsPayload(...args),
  getHealthPayload: (...args: unknown[]) => state.getHealthPayload(...args),
}))

describe('ops auth routes', () => {
  const originalAdminKey = process.env.ADMIN_KEY

  beforeEach(() => {
    process.env.ADMIN_KEY = 'test-admin-key-that-is-long-enough-for-validation'
    state.getPrometheusMetricsPayload.mockReset()
    state.getHealthPayload.mockReset()
    state.getPrometheusMetricsPayload.mockReturnValue(
      '# HELP djd_http_requests_total Total HTTP requests\n' +
        'djd_http_requests_total{method="GET",path="/health",status="200"} 4',
    )
    state.getHealthPayload.mockImplementation((detailed: boolean) => {
      if (detailed) {
        return {
          status: 'ok',
          version: '2.5.0',
          uptime: 123,
          modelVersion: '2.5.0',
          experimentalStatus: true,
          warnings: [
            {
              code: 'example_warning',
              message: 'example detailed warning',
            },
          ],
          runtime: {
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
          },
          integrations: {
            githubVerification: {
              authenticated: false,
              mode: 'unauthenticated',
              rateLimitPerHour: 60,
            },
            erc8004Publisher: {
              configured: false,
              active: false,
            },
            evaluatorOracleSigner: {
              configured: false,
              active: false,
              source: 'unconfigured',
              address: null,
            },
          },
          database: {
            cachedScores: 0,
            indexedWallets: 0,
            totalTransactionsIndexed: 0,
            totalFraudReports: 0,
            totalQueryLogEntries: 0,
            totalOutcomesTracked: 0,
          },
          indexer: {
            lastBlockIndexed: 0,
            running: false,
          },
          jobs: {
            hourlyRefresh: {
              lastRun: null,
              walletsRefreshed: 0,
            },
            intentMatcher: {
              lastRun: null,
              queriesProcessed: 0,
            },
            outcomeMatcher: {
              lastRun: null,
              outcomesRecorded: 0,
            },
            anomalyDetector: {
              lastRun: null,
              anomaliesFound: 0,
            },
            dailyAggregator: {
              lastRun: null,
            },
          },
        }
      }

      return {
        status: 'ok',
        version: '2.5.0',
        uptime: 123,
      }
    })
  })

  afterEach(() => {
    if (originalAdminKey !== undefined) {
      process.env.ADMIN_KEY = originalAdminKey
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  it('keeps /metrics behind admin auth', async () => {
    const { Hono } = await import('hono')
    const { default: metricsRoute } = await import('../../src/routes/metrics.js')

    const app = new Hono()
    app.route('/metrics', metricsRoute)

    const unauthorizedRes = await app.request('/metrics')
    expect(unauthorizedRes.status).toBe(401)

    const authorizedRes = await app.request('/metrics', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    expect(authorizedRes.status).toBe(200)
    expect(authorizedRes.headers.get('content-type')).toContain('text/plain')
    expect(authorizedRes.headers.get('cache-control')).toBe('no-cache')
    expect(await authorizedRes.text()).toContain('djd_http_requests_total')
    expect(state.getPrometheusMetricsPayload).toHaveBeenCalledTimes(1)
  })

  it('returns minimal public health data unless the admin key is valid', async () => {
    const { Hono } = await import('hono')
    const { default: healthRoute } = await import('../../src/routes/health.js')

    const app = new Hono()
    app.route('/health', healthRoute)

    const publicRes = await app.request('/health')
    expect(publicRes.status).toBe(200)
    const publicBody = await publicRes.json()
    expect(publicBody).toEqual({
      status: 'ok',
      version: '2.5.0',
      uptime: 123,
    })
    expect(state.getHealthPayload).toHaveBeenCalledWith(false)

    const detailedRes = await app.request('/health', {
      headers: { 'x-admin-key': process.env.ADMIN_KEY as string },
    })
    expect(detailedRes.status).toBe(200)
    const detailedBody = await detailedRes.json()
    expect(detailedBody.modelVersion).toBe('2.5.0')
    expect(detailedBody.experimentalStatus).toBe(true)
    expect(detailedBody.database).toBeDefined()
    expect(detailedBody.warnings).toHaveLength(1)
    expect(state.getHealthPayload).toHaveBeenCalledWith(true)
  })
})
