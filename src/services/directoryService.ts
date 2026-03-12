import { countCachedScores, countRegisteredAgents, getLeaderboard, getScore } from '../db.js'
import { ErrorCodes } from '../errors.js'
import { log } from '../logger.js'
import type { LeaderboardEntry, LeaderboardResponse, Tier } from '../types.js'
import { makeBadge, TIER_COLORS } from '../utils/badgeGenerator.js'

interface DirectoryServiceError {
  ok: false
  code: string
  message: string
  status: 400
}

interface DirectoryServiceSuccess<T> {
  ok: true
  data: T
}

type DirectoryServiceResult<T> = DirectoryServiceError | DirectoryServiceSuccess<T>

export function getLeaderboardSnapshot(): LeaderboardResponse {
  const rows = getLeaderboard()
  const total = countCachedScores()
  const totalRegistered = countRegisteredAgents()
  const now = Date.now()

  const entries: LeaderboardEntry[] = rows.map((row, idx) => {
    let daysAlive = 0
    try {
      const raw = JSON.parse(row.raw_data) as { walletAgeDays?: number }
      daysAlive = raw.walletAgeDays ?? 0
    } catch (err) {
      log.warn('leaderboard', `Failed to parse raw_data for ${row.wallet}`, err)
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

  return {
    leaderboard: entries,
    totalAgentsScored: total,
    totalAgentsRegistered: totalRegistered,
    lastUpdated: new Date(now).toISOString(),
  }
}

export function getScoreBadge(filename: string): DirectoryServiceResult<{
  svg: string
  color: string
  score: number | null
  tier: string
}> {
  const wallet = filename.replace(/\.svg$/i, '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_WALLET,
      message: 'Invalid wallet address',
      status: 400,
    }
  }

  const row = getScore(wallet)
  const score = row?.composite_score ?? null
  const tier = row?.tier ?? 'Unverified'
  const color = TIER_COLORS[tier] ?? '#6b7280'

  return {
    ok: true,
    data: {
      svg: makeBadge('djd score', score !== null ? `${score} · ${tier}` : 'not scored', color),
      color,
      score,
      tier,
    },
  }
}
