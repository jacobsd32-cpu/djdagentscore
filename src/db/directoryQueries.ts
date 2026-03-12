import type { LeaderboardRow } from '../types.js'
import { db } from './connection.js'

const stmtLeaderboard = db.prepare<[], LeaderboardRow>(`
  SELECT s.*,
         CASE WHEN r.wallet IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
         COALESCE(r.github_verified, 0)                   AS github_verified_badge
  FROM scores s
  LEFT JOIN agent_registrations r ON LOWER(s.wallet) = r.wallet
  WHERE s.composite_score > 0
  ORDER BY s.composite_score DESC
  LIMIT 50
`)

export function getLeaderboard(): LeaderboardRow[] {
  return stmtLeaderboard.all()
}
