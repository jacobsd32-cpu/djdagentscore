import { Hono } from 'hono'
import { getLeaderboard, countCachedScores } from '../db.js'
import type { LeaderboardEntry, LeaderboardResponse, Tier } from '../types.js'

const BLOCKS_PER_DAY = 43_200

const leaderboard = new Hono()

// GET /v1/leaderboard  — free, no x402
leaderboard.get('/', (c) => {
  const rows = getLeaderboard()
  const total = countCachedScores()
  const now = Date.now()

  const entries: LeaderboardEntry[] = rows.map((row, idx) => {
    // Estimate daysAlive from raw_data if available
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
    }
  })

  const response: LeaderboardResponse = {
    leaderboard: entries,
    totalAgentsScored: total,
    lastUpdated: new Date(now).toISOString(),
  }

  return c.json(response)
})

export default leaderboard
