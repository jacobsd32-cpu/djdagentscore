import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  latestCalibration: undefined as Record<string, unknown> | undefined,
  flushChanges: 0,
  deletedTables: [] as string[],
  getRevenueSummary: vi.fn(),
  getTopPayers: vi.fn(),
  getRevenueByHour: vi.fn(),
  generateCalibrationReport: vi.fn(),
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
        if (sql.includes("UPDATE scores SET expires_at")) {
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
  getRevenueSummary: (...args: unknown[]) => state.getRevenueSummary(...args),
  getTopPayers: (...args: unknown[]) => state.getTopPayers(...args),
  getRevenueByHour: (...args: unknown[]) => state.getRevenueByHour(...args),
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
    state.generateCalibrationReport.mockReset()
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
})
