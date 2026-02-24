import { Hono } from 'hono'
import { countCachedScores, countRegisteredAgents, getLeaderboard } from '../db.js'
import type { LeaderboardEntry, LeaderboardResponse, Tier } from '../types.js'

const leaderboard = new Hono()

// GET /v1/leaderboard  — free, no x402
leaderboard.get('/', (c) => {
  const rows = getLeaderboard()
  const total = countCachedScores()
  const totalRegistered = countRegisteredAgents()
  const now = Date.now()

  const entries: LeaderboardEntry[] = rows.map((row, idx) => {
    let daysAlive = 0
    try {
      const raw = JSON.parse(row.raw_data) as { walletAgeDays?: number }
      daysAlive = raw.walletAgeDays ?? 0
    } catch {
      // ignore parse errors
    }

    return {
      rank: idx + 1,
      wallet: row.wallet,
      score: row.composite_score,
      tier: row.tier as Tier,
      daysAlive,
      isRegistered: row.is_registered === 1,
      githubVerified: row.github_verified_badge === 1,
    }
  })

  const response: LeaderboardResponse = {
    leaderboard: entries,
    totalAgentsScored: total,
    totalAgentsRegistered: totalRegistered,
    lastUpdated: new Date(now).toISOString(),
  }

  return c.json(response)
})

export default leaderboard
