import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  validWallet: '0x1234567890abcdef1234567890abcdef12345678',
  secondWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  scoreResult: {
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    score: 82,
    tier: 'Trusted',
    confidence: 0.92,
    recommendation: 'keep shipping',
    modelVersion: '2.0.0',
    lastUpdated: '2026-03-12T00:00:00.000Z',
    computedAt: '2026-03-12T00:00:00.000Z',
    scoreFreshness: 1,
    dataSource: 'live',
    sybilFlag: false,
    gamingIndicators: [],
    dimensions: {
      reliability: { score: 80, data: {} },
      viability: { score: 81, data: {} },
      identity: { score: 83, data: {} },
      capability: { score: 84, data: {} },
    },
    dataAvailability: {
      transactionHistory: 'high',
      walletAge: 'high',
      economicData: 'high',
      identityData: 'medium',
      communityData: 'low',
    },
    scoreHistory: [],
  },
  submitJob: vi.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
  getJob: vi.fn(),
  getOrCalculateScore: vi.fn(),
  getScore: vi.fn(),
  countFraudReportsByTarget: vi.fn(),
  countDistinctReportersByTarget: vi.fn(),
  sumFraudPenaltyByTarget: vi.fn(),
  countFraudDisputesByTarget: vi.fn(),
  getFraudReasonBreakdown: vi.fn(),
  getRatingsSummaryForWallet: vi.fn(),
  getIntentSummaryByTarget: vi.fn(),
  getCreatorStakeSummary: vi.fn(),
  listFraudPatternsByNames: vi.fn(),
}))

const VALID_WALLET = state.validWallet
const SECOND_WALLET = state.secondWallet

vi.mock('../../src/scoring/engine.js', () => ({
  getOrCalculateScore: state.getOrCalculateScore,
}))

vi.mock('../../src/jobs/scoreQueue.js', () => ({
  submitJob: state.submitJob,
  getJob: state.getJob,
}))

vi.mock('../../src/db.js', () => ({
  getScore: (...args: unknown[]) => state.getScore(...args),
  countFraudReportsByTarget: (...args: unknown[]) => state.countFraudReportsByTarget(...args),
  countDistinctReportersByTarget: (...args: unknown[]) => state.countDistinctReportersByTarget(...args),
  sumFraudPenaltyByTarget: (...args: unknown[]) => state.sumFraudPenaltyByTarget(...args),
  countFraudDisputesByTarget: (...args: unknown[]) => state.countFraudDisputesByTarget(...args),
  getFraudReasonBreakdown: (...args: unknown[]) => state.getFraudReasonBreakdown(...args),
  getRatingsSummaryForWallet: (...args: unknown[]) => state.getRatingsSummaryForWallet(...args),
  getIntentSummaryByTarget: (...args: unknown[]) => state.getIntentSummaryByTarget(...args),
  getCreatorStakeSummary: (...args: unknown[]) => state.getCreatorStakeSummary(...args),
  listFraudPatternsByNames: (...args: unknown[]) => state.listFraudPatternsByNames(...args),
}))

describe('score routes', () => {
  beforeEach(() => {
    state.getOrCalculateScore.mockReset()
    state.submitJob.mockClear()
    state.getJob.mockReset()
    state.getOrCalculateScore.mockResolvedValue({ ...state.scoreResult })
    state.getScore.mockReset()
    state.countFraudReportsByTarget.mockReset()
    state.countDistinctReportersByTarget.mockReset()
    state.sumFraudPenaltyByTarget.mockReset()
    state.countFraudDisputesByTarget.mockReset()
    state.getFraudReasonBreakdown.mockReset()
    state.getRatingsSummaryForWallet.mockReset()
    state.getIntentSummaryByTarget.mockReset()
    state.getCreatorStakeSummary.mockReset()
    state.listFraudPatternsByNames.mockReset()

    state.getScore.mockReturnValue({
      sybil_indicators: '[]',
      gaming_indicators: '[]',
    })
    state.countFraudReportsByTarget.mockReturnValue(0)
    state.countDistinctReportersByTarget.mockReturnValue(0)
    state.sumFraudPenaltyByTarget.mockReturnValue(0)
    state.countFraudDisputesByTarget.mockReturnValue(0)
    state.getFraudReasonBreakdown.mockReturnValue([])
    state.getRatingsSummaryForWallet.mockReturnValue({
      rating_count: 0,
      unique_raters: 0,
      average_rating: null,
      most_recent_rating_at: null,
    })
    state.getIntentSummaryByTarget.mockReturnValue({
      intent_count: 0,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: null,
      most_recent_conversion_at: null,
    })
    state.getCreatorStakeSummary.mockReturnValue({
      active_stake_count: 0,
      active_staked_amount: 0,
      active_score_boost: 0,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: null,
    })
    state.listFraudPatternsByNames.mockReturnValue([])
  })

  it('returns a basic score response', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/basic?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.score).toBe(82)
    expect(body.dataSource).toBe('live')
    expect(body.dimensions).toBeUndefined()
  })

  it('returns 400 for an invalid wallet on basic score', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/basic?wallet=bad-wallet')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  it('returns a full score response', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/full?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.dimensions).toBeDefined()
  })

  it('returns a composite risk profile', async () => {
    state.getOrCalculateScore.mockResolvedValueOnce({
      ...state.scoreResult,
      score: 34,
      tier: 'Emerging',
      confidence: 0.81,
      recommendation: 'flagged_for_review',
      sybilFlag: true,
      gamingIndicators: ['rapid_score_refresh'],
    })
    state.getScore.mockReturnValueOnce({
      sybil_indicators: JSON.stringify(['tight_cluster', 'funded_by_top_partner']),
      gaming_indicators: JSON.stringify(['rapid_score_refresh']),
    })
    state.countFraudReportsByTarget.mockReturnValueOnce(3)
    state.countDistinctReportersByTarget.mockReturnValueOnce(2)
    state.sumFraudPenaltyByTarget.mockReturnValueOnce(15)
    state.countFraudDisputesByTarget.mockReturnValueOnce(1).mockReturnValueOnce(2)
    state.getFraudReasonBreakdown.mockReturnValueOnce([
      { reason: 'payment_fraud', count: 2 },
      { reason: 'impersonation', count: 1 },
    ])
    state.getRatingsSummaryForWallet.mockReturnValueOnce({
      rating_count: 4,
      unique_raters: 3,
      average_rating: 2.25,
      most_recent_rating_at: '2026-03-12T02:00:00.000Z',
    })
    state.getIntentSummaryByTarget.mockReturnValueOnce({
      intent_count: 6,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: '2026-03-12T01:00:00.000Z',
      most_recent_conversion_at: null,
    })
    state.getCreatorStakeSummary.mockReturnValueOnce({
      active_stake_count: 2,
      active_staked_amount: 150,
      active_score_boost: 3,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: '2026-03-12T03:00:00.000Z',
    })
    state.listFraudPatternsByNames.mockReturnValueOnce([
      {
        pattern_name: 'payment_fraud',
        risk_weight: 2.5,
        occurrences: 18,
        first_detected: '2026-02-01T00:00:00.000Z',
        last_detected: '2026-03-12T00:00:00.000Z',
      },
      {
        pattern_name: 'tight_cluster',
        risk_weight: 1.8,
        occurrences: 9,
        first_detected: '2026-02-10T00:00:00.000Z',
        last_detected: '2026-03-12T00:00:00.000Z',
      },
    ])

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/risk?wallet=${VALID_WALLET}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.wallet).toBe(VALID_WALLET)
    expect(body.risk_level).toBe('critical')
    expect(body.action).toBe('block')
    expect(body.summary.report_count).toBe(3)
    expect(body.summary.sybil_flagged).toBe(true)
    expect(body.summary.active_creator_stakes).toBe(2)
    expect(body.summary.active_score_boost).toBe(3)
    expect(body.factors.some((factor: { key: string }) => factor.key === 'fraud_reports')).toBe(true)
    expect(body.matched_patterns[0].pattern_name).toBe('payment_fraud')
  })

  it('returns 400 for an invalid wallet on risk score', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/risk?wallet=bad-wallet')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_wallet')
  })

  it('refreshes a score via POST', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request(`/v1/score/refresh?wallet=${VALID_WALLET}`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(state.getOrCalculateScore).toHaveBeenCalledWith(VALID_WALLET, true)
  })

  it('queues an async score job from the request body', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: VALID_WALLET }),
    })

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(body.wallet).toBe(VALID_WALLET)
    expect(state.submitJob).toHaveBeenCalledWith(VALID_WALLET)
  })

  it('returns 400 for invalid JSON on compute without a query wallet', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_json')
  })

  it('returns pending async job state', async () => {
    state.getJob.mockReturnValue({
      jobId: '123e4567-e89b-42d3-a456-426614174000',
      wallet: VALID_WALLET,
      status: 'pending',
      createdAt: Date.now(),
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.wallet).toBe(VALID_WALLET)
  })

  it('returns completed async job state with a basic result payload', async () => {
    state.getJob.mockReturnValue({
      jobId: '123e4567-e89b-42d3-a456-426614174000',
      wallet: VALID_WALLET,
      status: 'complete',
      createdAt: Date.now(),
      result: { ...state.scoreResult },
    })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body.result.score).toBe(82)
    expect(body.result.dimensions).toBeUndefined()
  })

  it('returns 404 for a missing score job', async () => {
    state.getJob.mockReturnValue(undefined)

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/job/123e4567-e89b-42d3-a456-426614174000')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('job_not_found')
  })

  it('scores a batch of wallets', async () => {
    state.getOrCalculateScore
      .mockResolvedValueOnce({ ...state.scoreResult, wallet: VALID_WALLET })
      .mockResolvedValueOnce({ ...state.scoreResult, wallet: SECOND_WALLET, score: 77, tier: 'Established' })

    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallets: [VALID_WALLET, SECOND_WALLET] }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.results[1].wallet).toBe(SECOND_WALLET)
    expect(body.results[1].score).toBe(77)
  })

  it('returns 400 for invalid batch input', async () => {
    const { Hono } = await import('hono')
    const { default: scoreRoute } = await import('../../src/routes/score.js')

    const app = new Hono()
    app.route('/v1/score', scoreRoute)

    const res = await app.request('/v1/score/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallets: [VALID_WALLET] }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('batch_invalid')
  })
})
