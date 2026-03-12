import { describe, expect, it, vi } from 'vitest'

const mockCountFraudReportsByTarget = vi.fn()
const mockGetFraudReasonBreakdown = vi.fn()
const mockListFraudReportsByTarget = vi.fn()

vi.mock('../../src/db.js', () => ({
  applyReportPenalty: vi.fn(),
  countDistinctReportersByTarget: vi.fn().mockReturnValue(0),
  countFraudDisputesByTarget: vi.fn().mockReturnValue(0),
  countForensicsFeed: vi.fn().mockReturnValue(0),
  countFraudReportsByTarget: (...args: unknown[]) => mockCountFraudReportsByTarget(...args),
  countForensicsWatchlistTargets: vi.fn().mockReturnValue(0),
  countReporterReportsForTarget: vi.fn().mockReturnValue(0),
  countScoreHistory: vi.fn().mockReturnValue(0),
  createFraudDispute: vi.fn(),
  getFraudDisputeByReportId: vi.fn(),
  getFraudReasonBreakdown: (...args: unknown[]) => mockGetFraudReasonBreakdown(...args),
  getFraudReportById: vi.fn(),
  getScore: vi.fn().mockReturnValue(null),
  insertReport: vi.fn(),
  listForensicsFeed: vi.fn().mockReturnValue([]),
  listForensicsWatchlist: vi.fn().mockReturnValue([]),
  listFraudReportsByTarget: (...args: unknown[]) => mockListFraudReportsByTarget(...args),
  listScoreHistory: vi.fn().mockReturnValue([]),
  sumFraudPenaltyByTarget: vi.fn().mockReturnValue(0),
}))

import { Hono } from 'hono'
import blacklistRoute from '../../src/routes/blacklist.js'

describe('GET /v1/data/fraud/blacklist', () => {
  it('returns report status for a wallet', async () => {
    mockCountFraudReportsByTarget.mockReturnValue(3)
    mockGetFraudReasonBreakdown.mockReturnValue([
      { reason: 'payment_fraud', count: 2 },
      { reason: 'malicious_behavior', count: 1 },
    ])
    mockListFraudReportsByTarget.mockReturnValue([
      { id: 'rpt-3', reason: 'payment_fraud', details: '', created_at: '2026-03-12T00:00:00Z', penalty_applied: 5 },
      { id: 'rpt-2', reason: 'payment_fraud', details: '', created_at: '2026-03-11T00:00:00Z', penalty_applied: 5 },
      {
        id: 'rpt-1',
        reason: 'malicious_behavior',
        details: '',
        created_at: '2026-03-10T00:00:00Z',
        penalty_applied: 5,
      },
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
