import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsertReport = vi.fn()
const mockGetScore = vi.fn().mockReturnValue({ composite_score: 50 })
const mockApplyReportPenalty = vi.fn()
const mockScoreToTier = vi.fn().mockReturnValue('Established')
const mockCountReporterReportsForTarget = vi.fn().mockReturnValue(0)

vi.mock('../../src/db.js', () => ({
  insertReport: (...args: unknown[]) => mockInsertReport(...args),
  getScore: (...args: unknown[]) => mockGetScore(...args),
  applyReportPenalty: (...args: unknown[]) => mockApplyReportPenalty(...args),
  scoreToTier: (...args: unknown[]) => mockScoreToTier(...args),
  countReporterReportsForTarget: (...args: unknown[]) => mockCountReporterReportsForTarget(...args),
}))

// uuid mock for deterministic IDs
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}))

import { Hono } from 'hono'
import reportRoute from '../../src/routes/report.js'

function makeApp() {
  const app = new Hono()
  app.route('/v1/report', reportRoute)
  return app
}

const VALID_BODY = {
  target: '0x1111111111111111111111111111111111111111',
  reporter: '0x2222222222222222222222222222222222222222',
  reason: 'payment_fraud',
  details: 'Suspicious transfers observed',
}

describe('POST /v1/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCountReporterReportsForTarget.mockReturnValue(0)
    mockGetScore.mockReturnValue({ composite_score: 50 })
  })

  it('accepts a valid report and returns 201', async () => {
    const app = makeApp()
    const res = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.reportId).toBe('test-uuid-1234')
    expect(body.status).toBe('accepted')
    expect(body.penaltyApplied).toBe(5)
    expect(mockInsertReport).toHaveBeenCalledOnce()
    expect(mockApplyReportPenalty).toHaveBeenCalledOnce()
  })

  it('returns 429 when reporter has already filed 3 reports against target', async () => {
    mockCountReporterReportsForTarget.mockReturnValue(3)
    const app = makeApp()
    const res = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error.code).toBe('report_limit_exceeded')
    expect(body.error.message).toMatch(/report limit/i)
    expect(mockInsertReport).not.toHaveBeenCalled()
  })

  it('returns 400 for missing target', async () => {
    const app = makeApp()
    const res = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, target: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when target equals reporter', async () => {
    const app = makeApp()
    const res = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, reporter: VALID_BODY.target }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp()
    const res = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })
})
