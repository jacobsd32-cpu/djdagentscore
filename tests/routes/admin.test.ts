import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  latestCalibration: undefined as Record<string, unknown> | undefined,
  flushChanges: 0,
  deletedTables: [] as string[],
  getRevenueSummary: vi.fn(),
  getTopPayers: vi.fn(),
  getRevenueByHour: vi.fn(),
  getGrowthMetricByEvent: vi.fn(),
  getGrowthBreakdownByPrefix: vi.fn(),
  getTopGrowthReferrers: vi.fn(),
  getTopGrowthPages: vi.fn(),
  getGrowthPackageUsage: vi.fn(),
  getRecentGrowthEvents: vi.fn(),
  getPaidUsageSummary: vi.fn(),
  generateCalibrationReport: vi.fn(),
  countFraudReportsByTarget: vi.fn(),
  sumFraudPenaltyByTarget: vi.fn(),
  listFraudDisputes: vi.fn(),
  countFraudDisputes: vi.fn(),
  getFraudDisputeById: vi.fn(),
  getFraudReportById: vi.fn(),
  resolveFraudDispute: vi.fn(),
  queueWebhookEvent: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  db: {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(() => {
        if (sql.includes('SELECT * FROM calibration_reports')) {
          return state.latestCalibration
        }
        return undefined
      }),
      run: vi.fn(() => {
        if (sql.includes('UPDATE scores SET expires_at')) {
          return { changes: state.flushChanges }
        }
        if (sql.startsWith('DELETE FROM ')) {
          const table = sql.replace('DELETE FROM ', '').trim()
          state.deletedTables.push(table)
          return { changes: 1 }
        }
        return { changes: 0 }
      }),
    })),
    transaction: vi.fn((fn: () => void) => fn),
  },
  countFraudReportsByTarget: (...args: unknown[]) => state.countFraudReportsByTarget(...args),
  sumFraudPenaltyByTarget: (...args: unknown[]) => state.sumFraudPenaltyByTarget(...args),
  getRevenueSummary: (...args: unknown[]) => state.getRevenueSummary(...args),
  getTopPayers: (...args: unknown[]) => state.getTopPayers(...args),
  getRevenueByHour: (...args: unknown[]) => state.getRevenueByHour(...args),
  insertGrowthEvent: vi.fn(),
  getGrowthMetricByEvent: (...args: unknown[]) => state.getGrowthMetricByEvent(...args),
  getGrowthBreakdownByPrefix: (...args: unknown[]) => state.getGrowthBreakdownByPrefix(...args),
  getTopGrowthReferrers: (...args: unknown[]) => state.getTopGrowthReferrers(...args),
  getTopGrowthPages: (...args: unknown[]) => state.getTopGrowthPages(...args),
  getGrowthPackageUsage: (...args: unknown[]) => state.getGrowthPackageUsage(...args),
  getRecentGrowthEvents: (...args: unknown[]) => state.getRecentGrowthEvents(...args),
  getPaidUsageSummary: (...args: unknown[]) => state.getPaidUsageSummary(...args),
  listFraudDisputes: (...args: unknown[]) => state.listFraudDisputes(...args),
  countFraudDisputes: (...args: unknown[]) => state.countFraudDisputes(...args),
  getFraudDisputeById: (...args: unknown[]) => state.getFraudDisputeById(...args),
  getFraudReportById: (...args: unknown[]) => state.getFraudReportById(...args),
  resolveFraudDispute: (...args: unknown[]) => state.resolveFraudDispute(...args),
}))

vi.mock('../../src/jobs/webhookDelivery.js', () => ({
  queueWebhookEvent: (...args: unknown[]) => state.queueWebhookEvent(...args),
}))

vi.mock('../../src/scoring/calibrationReport.js', () => ({
  generateCalibrationReport: (...args: unknown[]) => state.generateCalibrationReport(...args),
}))

vi.mock('../../src/scoring/responseBuilders.js', () => ({
  MODEL_VERSION: '2.0.0',
}))

describe('admin middleware', () => {
  const originalKey = process.env.ADMIN_KEY

  beforeEach(() => {
    state.latestCalibration = undefined
    state.flushChanges = 0
    state.deletedTables = []
    state.getRevenueSummary.mockReset()
    state.getTopPayers.mockReset()
    state.getRevenueByHour.mockReset()
    state.getGrowthMetricByEvent.mockReset()
    state.getGrowthBreakdownByPrefix.mockReset()
    state.getTopGrowthReferrers.mockReset()
    state.getTopGrowthPages.mockReset()
    state.getGrowthPackageUsage.mockReset()
    state.getRecentGrowthEvents.mockReset()
    state.getPaidUsageSummary.mockReset()
    state.generateCalibrationReport.mockReset()
    state.countFraudReportsByTarget.mockReset()
    state.sumFraudPenaltyByTarget.mockReset()
    state.listFraudDisputes.mockReset()
    state.countFraudDisputes.mockReset()
    state.getFraudDisputeById.mockReset()
    state.getFraudReportById.mockReset()
    state.resolveFraudDispute.mockReset()
    state.queueWebhookEvent.mockReset()
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ADMIN_KEY = originalKey
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    delete process.env.ADMIN_KEY

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/calibration', {
      headers: { 'x-admin-key': 'anything' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Admin key not configured')
  })

  it('returns 401 when wrong key is provided', async () => {
    process.env.ADMIN_KEY = 'secret-key'

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/calibration', {
      headers: { 'x-admin-key': 'wrong-key' },
    })
    expect(res.status).toBe(401)
  })

  it('returns a generated calibration report when no cached report exists', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.generateCalibrationReport.mockReturnValue({
      avg_score_by_outcome: '{"positive":{"avgScore":80}}',
      tier_accuracy: '{"Trusted":0.8}',
      recommendations: '["keep going"]',
    })

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/calibration', {
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.avg_score_by_outcome).toEqual({ positive: { avgScore: 80 } })
    expect(body.recommendations).toEqual(['keep going'])
  })

  it('flushes score cache through the admin service', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.flushChanges = 12

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/flush-scores', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.flushed).toBe(12)
    expect(body.modelVersion).toBe('2.0.0')
  })

  it('returns clamped revenue summary data', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.getRevenueSummary.mockReturnValue({
      totalRevenue: 123,
      paidQueryCount: 4,
      freeQueryCount: 7,
      revenueByEndpoint: [],
      revenueByDay: [],
    })

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/revenue?days=999', {
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toBe(365)
    expect(body.totalRevenue).toBe(123)
    expect(state.getRevenueSummary).toHaveBeenCalledWith(365)
  })

  it('returns top payers and realtime revenue views', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.getTopPayers.mockReturnValue([{ wallet: '0xabc', totalSpent: 12, queryCount: 2, lastSeen: '2026-03-12' }])
    state.getRevenueByHour.mockReturnValue([{ hour: '2026-03-12T10:00:00Z', revenue: 9, count: 3 }])

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const payersRes = await app.request('/admin/revenue/top-payers?limit=500', {
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(payersRes.status).toBe(200)
    const payersBody = await payersRes.json()
    expect(payersBody.count).toBe(1)
    expect(state.getTopPayers).toHaveBeenCalledWith(100)

    const realtimeRes = await app.request('/admin/revenue/realtime', {
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(realtimeRes.status).toBe(200)
    const realtimeBody = await realtimeRes.json()
    expect(realtimeBody.count).toBe(1)
    expect(realtimeBody.hours[0].revenue).toBe(9)
  })

  it('returns the funnel summary view', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.getGrowthMetricByEvent.mockImplementation((event: string) => {
      const rows: Record<string, { count: number; unique_count: number }> = {
        landing_view: { count: 20, unique_count: 12 },
        lookup_submit: { count: 8, unique_count: 6 },
        lookup_success: { count: 6, unique_count: 5 },
        cta_docs: { count: 3, unique_count: 3 },
        cta_pricing: { count: 2, unique_count: 2 },
        cta_register: { count: 1, unique_count: 1 },
        agent_registered: { count: 2, unique_count: 2 },
        billing_checkout_started: { count: 2, unique_count: 2 },
        billing_success_viewed: { count: 1, unique_count: 1 },
        api_key_created: { count: 1, unique_count: 1 },
      }
      return rows[event] ?? { count: 0, unique_count: 0 }
    })
    state.getGrowthBreakdownByPrefix.mockReturnValue([{ key: 'path_x402', count: 4, unique_count: 4 }])
    state.getTopGrowthReferrers.mockReturnValue([{ key: 'https://x.com', count: 3, unique_count: 3 }])
    state.getTopGrowthPages.mockReturnValue([{ key: '/', count: 10, unique_count: 8 }])
    state.getGrowthPackageUsage.mockReturnValue([{ package_name: 'djd-agent-score', count: 5, unique_wallets: 2 }])
    state.getRecentGrowthEvents.mockReturnValue([
      {
        id: 1,
        event_name: 'lookup_success',
        source: 'web',
        anonymous_id: 'anon-1',
        session_id: 'sess-1',
        page_path: '/',
        referrer: null,
        wallet: null,
        package_name: null,
        user_agent: 'test',
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        metadata_json: '{"score":78}',
        created_at: '2026-03-12T00:00:00Z',
      },
    ])
    state.getPaidUsageSummary.mockReturnValue({
      paid_queries: 4,
      paid_wallets: 2,
      api_key_queries: 3,
      external_wallets_scored: 7,
    })

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/funnel?days=999', {
      headers: { 'x-admin-key': 'secret-key' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toBe(365)
    expect(body.acquisition.uniqueVisitors).toBe(12)
    expect(body.activation.packageUsage[0].package_name).toBe('djd-agent-score')
    expect(body.monetization.paidQueries).toBe(4)
    expect(body.conversionRates.visitorToLookupPct).toBe(50)
    expect(body.recentEvents[0].metadata.score).toBe(78)
  })

  it('resets test data while preserving indexed tables metadata', async () => {
    process.env.ADMIN_KEY = 'secret-key'

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/reset-test-data', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toContain('Test data cleared')
    expect(body.cleared.query_log).toBe(1)
    expect(body.preserved).toContain('raw_transactions')
    expect(state.deletedTables).toContain('query_log')
    expect(state.deletedTables).toContain('certifications')
  })

  it('returns the forensics dispute queue', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.listFraudDisputes.mockReturnValue([
      {
        dispute_id: 'disp-1',
        report_id: 'rpt-1',
        target_wallet: '0x1111111111111111111111111111111111111111',
        disputing_wallet: '0x1111111111111111111111111111111111111111',
        dispute_reason: 'fulfilled_service',
        dispute_details: 'Delivery logs attached.',
        dispute_status: 'open',
        dispute_resolution: null,
        dispute_created_at: '2026-03-12T00:00:00Z',
        dispute_resolved_at: null,
        resolution_notes: null,
        resolved_by: null,
        report_reason: 'payment_fraud',
        report_details: 'Buyer claimed no delivery.',
        report_created_at: '2026-03-11T00:00:00Z',
        reporter_wallet: '0x2222222222222222222222222222222222222222',
        penalty_applied: 5,
        report_invalidated_at: null,
      },
    ])
    state.countFraudDisputes.mockReturnValue(1)

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/forensics/disputes?status=open&limit=10', {
      headers: { 'x-admin-key': 'secret-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.returned).toBe(1)
    expect(body.status_filter).toBe('open')
    expect(body.disputes[0].report.reason).toBe('payment_fraud')
    expect(state.listFraudDisputes).toHaveBeenCalledWith({
      status: 'open',
      wallet: undefined,
      limit: 10,
    })
  })

  it('resolves a forensics dispute through the admin route', async () => {
    process.env.ADMIN_KEY = 'secret-key'
    state.getFraudDisputeById.mockReturnValue({
      id: 'disp-1',
      report_id: 'rpt-1',
      target_wallet: '0x1111111111111111111111111111111111111111',
      status: 'open',
    })
    state.getFraudReportById.mockReturnValue({
      id: 'rpt-1',
      penalty_applied: 5,
    })
    state.countFraudReportsByTarget.mockReturnValueOnce(1).mockReturnValueOnce(0)
    state.sumFraudPenaltyByTarget.mockReturnValueOnce(5).mockReturnValueOnce(0)
    state.resolveFraudDispute.mockReturnValue({
      resolvedAt: '2026-03-12T12:00:00Z',
      penaltyRestored: 5,
      reportInvalidated: true,
    })

    const { Hono } = await import('hono')
    const { default: adminRoute } = await import('../../src/routes/admin.js')

    const app = new Hono()
    app.route('/admin', adminRoute)

    const res = await app.request('/admin/forensics/disputes/disp-1/resolve', {
      method: 'POST',
      headers: {
        'x-admin-key': 'secret-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolution: 'upheld', notes: 'Counter-evidence verified.' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.disputeId).toBe('disp-1')
    expect(body.resolution).toBe('upheld')
    expect(body.reportInvalidated).toBe(true)
    expect(body.penaltyRestored).toBe(5)
    expect(state.resolveFraudDispute).toHaveBeenCalledWith({
      disputeId: 'disp-1',
      reportId: 'rpt-1',
      targetWallet: '0x1111111111111111111111111111111111111111',
      resolution: 'upheld',
      resolutionNotes: 'Counter-evidence verified.',
      resolvedBy: 'admin',
      penaltyApplied: 5,
    })
    expect(state.queueWebhookEvent).toHaveBeenCalledWith(
      'fraud.dispute.resolved',
      expect.objectContaining({
        disputeId: 'disp-1',
        resolution: 'upheld',
      }),
    )
  })
})
