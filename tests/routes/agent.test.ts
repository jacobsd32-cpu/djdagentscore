import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getScore: vi.fn(),
  getScoreHistory: vi.fn(() => []),
  getRegistration: vi.fn(() => undefined),
  getActiveCertification: vi.fn(() => undefined),
  getOrCalculateScore: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  getScore: state.getScore,
  getScoreHistory: state.getScoreHistory,
  getRegistration: state.getRegistration,
  getActiveCertification: state.getActiveCertification,
  scoreToTier: (score: number) => (score >= 75 ? 'Trusted' : 'Emerging'),
}))

vi.mock('../../src/scoring/engine.js', () => ({
  getOrCalculateScore: state.getOrCalculateScore,
}))

import { Hono } from 'hono'
import agentRoute from '../../src/routes/agent.js'

const WALLET = '0x1111111111111111111111111111111111111111'

function makeScoreRow(overrides: Record<string, unknown> = {}) {
  return {
    wallet: WALLET,
    composite_score: 88,
    reliability_score: 81,
    viability_score: 79,
    identity_score: 92,
    capability_score: 85,
    behavior_score: 76,
    tier: 'Trusted',
    raw_data: '{}',
    calculated_at: '2026-03-12T00:00:00Z',
    expires_at: '2026-03-12T01:00:00Z',
    confidence: 0.91,
    recommendation: 'proceed',
    model_version: '2.0.0',
    sybil_flag: 0,
    sybil_indicators: '[]',
    gaming_indicators: '[]',
    ...overrides,
  }
}

describe('GET /agent/:wallet', () => {
  beforeEach(() => {
    state.getScore.mockReset()
    state.getScoreHistory.mockReset()
    state.getRegistration.mockReset()
    state.getActiveCertification.mockReset()
    state.getOrCalculateScore.mockReset()

    state.getScoreHistory.mockReturnValue([])
    state.getRegistration.mockReturnValue(undefined)
    state.getActiveCertification.mockReturnValue(undefined)
  })

  it('returns 400 for an invalid wallet', async () => {
    const app = new Hono()
    app.route('/agent', agentRoute)

    const res = await app.request('/agent/not-a-wallet')
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid wallet address')
  })

  it('renders the cached agent profile page', async () => {
    state.getScore.mockReturnValue(makeScoreRow())
    state.getRegistration.mockReturnValue({
      wallet: WALLET,
      name: 'Beast Mode Agent',
      description: 'Ships production code.',
      github_url: 'https://github.com/example/agent',
      website_url: null,
      registered_at: '2026-03-12T00:00:00Z',
      updated_at: '2026-03-12T00:00:00Z',
      github_verified: 1,
      github_stars: 42,
      github_pushed_at: '2026-03-11T00:00:00Z',
      github_verified_at: '2026-03-12T00:00:00Z',
    })

    const app = new Hono()
    app.route('/agent', agentRoute)

    const res = await app.request(`/agent/${WALLET}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const body = await res.text()
    expect(body).toContain('Beast Mode Agent')
    expect(body).toContain('Ships production code.')
    expect(body).toContain('88')
    expect(body).toContain('Trusted')
    expect(body).toContain('ERC-8004 document')
    expect(body).toContain('Evaluator preview')
    expect(body).toContain(`/certify?wallet=${WALLET}`)
  })

  it('renders active certification trust surfaces when certified', async () => {
    state.getScore.mockReturnValue(makeScoreRow())
    state.getRegistration.mockReturnValue({
      wallet: WALLET,
      name: 'Certified Beast',
      description: 'Certified agent profile.',
      github_url: null,
      website_url: 'https://example.test',
      registered_at: '2026-03-12T00:00:00Z',
      updated_at: '2026-03-12T00:00:00Z',
      github_verified: 0,
      github_stars: null,
      github_pushed_at: null,
      github_verified_at: null,
    })
    state.getActiveCertification.mockReturnValue({
      id: 7,
      wallet: WALLET,
      tier: 'Trusted',
      score_at_certification: 88,
      granted_at: '2026-03-12T00:00:00Z',
      expires_at: '2027-03-12T00:00:00Z',
      is_active: 1,
      tx_hash: null,
      revoked_at: null,
      revocation_reason: null,
    })

    const app = new Hono()
    app.route('/agent', agentRoute)

    const res = await app.request(`/agent/${WALLET}`)
    expect(res.status).toBe(200)

    const body = await res.text()
    expect(body).toContain('Certified through DJD')
    expect(body).toContain('Certification status')
    expect(body).toContain('/v1/certification/badge/')
    expect(body).toContain(`/certify?wallet=${WALLET}`)
  })

  it('computes the score when the cache is cold', async () => {
    state.getScore
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(makeScoreRow({ composite_score: 73, tier: 'Established' }))
    state.getOrCalculateScore.mockResolvedValue({ wallet: WALLET })

    const app = new Hono()
    app.route('/agent', agentRoute)

    const res = await app.request(`/agent/${WALLET}`)
    expect(res.status).toBe(200)
    expect(state.getOrCalculateScore).toHaveBeenCalledWith(WALLET, false)
    expect(await res.text()).toContain('73')
  })
})
