import { Hono } from 'hono'
import { getLeaderboardSnapshot } from '../services/directoryService.js'

const leaderboard = new Hono()

// GET /v1/leaderboard  — free, no x402
leaderboard.get('/', (c) => {
  return c.json(getLeaderboardSnapshot())
})

export default leaderboard
