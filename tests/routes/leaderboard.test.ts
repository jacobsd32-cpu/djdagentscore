import { describe, expect, it, vi } from 'vitest'

const mockGetLeaderboard = vi.fn()
const mockCountCachedScores = vi.fn(() => 2)
const mockCountRegisteredAgents = vi.fn(() => 1)

vi.mock('../../src/db.js', () => ({
  getLeaderboard: (...args: unknown[]) => mockGetLeaderboard(...args),
  countCachedScores: (...args: unknown[]) => mockCountCachedScores(...args),
  countRegisteredAgents: (...args: unknown[]) => mockCountRegisteredAgents(...args),
}))

import { Hono } from 'hono'
import leaderboardRoute from '../../src/routes/leaderboard.js'

describe('GET /v1/leaderboard', () => {
  it('returns mapped leaderboard entries and totals', async () => {
    mockGetLeaderboard.mockReturnValue([
      {
        wallet: '0x1111111111111111111111111111111111111111',
        composite_score: 91,
        tier: 'Elite',
        raw_data: JSON.stringify({ walletAgeDays: 120 }),
        is_registered: 1,
        github_verified_badge: 1,
      },
      {
        wallet: '0x2222222222222222222222222222222222222222',
        composite_score: 77,
        tier: 'Trusted',
        raw_data: '{',
        is_registered: 0,
        github_verified_badge: 0,
      },
    ])

    const app = new Hono()
    app.route('/v1/leaderboard', leaderboardRoute)

    const res = await app.request('/v1/leaderboard')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.totalAgentsScored).toBe(2)
    expect(body.totalAgentsRegistered).toBe(1)
    expect(body.leaderboard).toHaveLength(2)
    expect(body.leaderboard[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        wallet: '0x1111111111111111111111111111111111111111',
        score: 91,
        tier: 'Elite',
        daysAlive: 120,
        isRegistered: true,
        githubVerified: true,
      }),
    )
    expect(body.leaderboard[1].daysAlive).toBe(0)
    expect(body.lastUpdated).toMatch(/Z$/)
  })
})
