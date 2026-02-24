import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../../src/db.js', () => ({
  db: {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    }),
  },
}))

vi.mock('../../src/scoring/calibrationReport.js', () => ({
  generateCalibrationReport: vi.fn().mockReturnValue({}),
}))

vi.mock('../../src/scoring/responseBuilders.js', () => ({
  MODEL_VERSION: '2.0.0',
}))

describe('admin middleware', () => {
  const originalKey = process.env.ADMIN_KEY

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
})
