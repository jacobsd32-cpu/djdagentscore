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

describe('score routes', () => {
  beforeEach(() => {
    state.getOrCalculateScore.mockReset()
    state.submitJob.mockClear()
    state.getJob.mockReset()
    state.getOrCalculateScore.mockResolvedValue({ ...state.scoreResult })
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
