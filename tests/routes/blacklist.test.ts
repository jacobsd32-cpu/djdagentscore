import { describe, expect, it, vi } from 'vitest'

const mockListReportsByTarget = vi.fn()

vi.mock('../../src/db.js', () => ({
  listReportsByTarget: (...args: unknown[]) => mockListReportsByTarget(...args),
}))

import { Hono } from 'hono'
import blacklistRoute from '../../src/routes/blacklist.js'

describe('GET /v1/data/fraud/blacklist', () => {
  it('returns report status for a wallet', async () => {
    mockListReportsByTarget.mockReturnValue([
      { reason: 'payment_fraud', created_at: '2026-03-12T00:00:00Z' },
      { reason: 'payment_fraud', created_at: '2026-03-11T00:00:00Z' },
      { reason: 'malicious_behavior', created_at: '2026-03-10T00:00:00Z' },
    ])

    const app = new Hono()
    app.route('/v1/data/fraud/blacklist', blacklistRoute)

    const res = await app.request('/v1/data/fraud/blacklist?wallet=0x1111111111111111111111111111111111111111')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.reported).toBe(true)
    expect(body.reportCount).toBe(3)
    expect(body.mostRecentDate).toBe('2026-03-12T00:00:00Z')
    expect(body.reasons).toEqual(['payment_fraud', 'malicious_behavior'])
  })

  it('returns 400 for an invalid wallet', async () => {
    const app = new Hono()
    app.route('/v1/data/fraud/blacklist', blacklistRoute)

    const res = await app.request('/v1/data/fraud/blacklist?wallet=bad-wallet')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })
})
