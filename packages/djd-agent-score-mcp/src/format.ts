/**
 * Formatters that convert JSON API responses into human-readable text.
 *
 * MCP tool responses are text — these functions turn structured API data
 * into clear, scannable summaries that AI assistants can reason about.
 */

import type {
  BasicScoreResponse,
  FullScoreResponse,
  LeaderboardResponse,
  EconomyMetrics,
} from 'djd-agent-score-client'

// ── Score formatters ─────────────────────────────────────────────────────────

export function formatBasicScore(data: BasicScoreResponse): string {
  const lines = [
    `Wallet: ${data.wallet}`,
    `Score: ${data.score}/100 (${data.tier})`,
    `Confidence: ${(data.confidence * 100).toFixed(0)}%`,
    `Recommendation: ${data.recommendation}`,
    `Data source: ${data.dataSource ?? 'unknown'}`,
    `Last updated: ${data.lastUpdated}`,
  ]
  if (data.stale) lines.push('⚠ Score is stale — consider requesting a refresh.')
  if (data.freeTier) {
    lines.push(`Free tier (${data.freeQueriesRemainingToday ?? '?'} queries remaining today)`)
  }
  return lines.join('\n')
}

export function formatFullScore(data: FullScoreResponse): string {
  const lines = [
    `Wallet: ${data.wallet}`,
    `Score: ${data.score}/100 (${data.tier})`,
    `Confidence: ${(data.confidence * 100).toFixed(0)}%`,
    `Recommendation: ${data.recommendation}`,
    '',
    '── Dimensions ──',
  ]

  for (const [name, dim] of Object.entries(data.dimensions)) {
    if (dim) lines.push(`  ${name}: ${dim.score}/100`)
  }

  if (data.sybilFlag) lines.push('\n⚠ SYBIL FLAG: This wallet has sybil indicators.')
  if (data.gamingIndicators?.length) {
    lines.push(`Gaming indicators: ${data.gamingIndicators.join(', ')}`)
  }

  if (data.scoreRange) {
    lines.push(`\nScore range: ${data.scoreRange.low}–${data.scoreRange.high}`)
  }
  if (data.integrityMultiplier !== undefined && data.integrityMultiplier !== 1) {
    lines.push(`Integrity multiplier: ${data.integrityMultiplier.toFixed(2)}`)
  }
  if (data.topContributors?.length) {
    lines.push(`Top contributors: ${data.topContributors.join(', ')}`)
  }
  if (data.topDetractors?.length) {
    lines.push(`Top detractors: ${data.topDetractors.join(', ')}`)
  }
  if (data.improvementPath?.length) {
    lines.push(`\nImprovement path:\n${data.improvementPath.map((s) => `  • ${s}`).join('\n')}`)
  }

  lines.push(`\nData source: ${data.dataSource ?? 'unknown'}`)
  lines.push(`Last updated: ${data.lastUpdated}`)

  return lines.join('\n')
}

// ── History formatter ────────────────────────────────────────────────────────

interface HistoryEntry {
  score: number
  confidence: number
  model_version: string
  calculated_at: string
}

export interface HistoryResponse {
  wallet: string
  history: HistoryEntry[]
  count: number
  returned: number
  period: { from: string | null; to: string | null }
  trend?: {
    direction: string
    change_pct: number
    avg_score: number
    min_score: number
    max_score: number
  }
  trajectory?: {
    velocity: number
    momentum: number
    direction: string
    volatility: number
    modifier: number
    dataPoints: number
    spanDays: number
  }
}

export function formatHistory(data: HistoryResponse): string {
  const lines = [
    `Wallet: ${data.wallet}`,
    `Score history: ${data.returned} of ${data.count} entries`,
    `Period: ${data.period.from ?? '?'} → ${data.period.to ?? '?'}`,
  ]

  if (data.trend) {
    lines.push(
      `\nTrend: ${data.trend.direction} (${data.trend.change_pct > 0 ? '+' : ''}${data.trend.change_pct}%)`,
      `  Average: ${data.trend.avg_score} | Range: ${data.trend.min_score}–${data.trend.max_score}`,
    )
  }

  if (data.trajectory) {
    const t = data.trajectory
    lines.push(
      `\nTrajectory (${t.dataPoints} data points over ${t.spanDays} days):`,
      `  Direction: ${t.direction} | Velocity: ${t.velocity.toFixed(2)} | Momentum: ${t.momentum.toFixed(2)}`,
      `  Volatility: ${t.volatility.toFixed(2)} | Score modifier: ${t.modifier > 0 ? '+' : ''}${t.modifier}`,
    )
  }

  if (data.history.length > 0) {
    lines.push('\n── Recent scores ──')
    for (const entry of data.history.slice(0, 10)) {
      lines.push(`  ${entry.calculated_at}: ${entry.score} (confidence: ${(entry.confidence * 100).toFixed(0)}%)`)
    }
    if (data.history.length > 10) {
      lines.push(`  ... and ${data.history.length - 10} more`)
    }
  }

  return lines.join('\n')
}

// ── Leaderboard formatter ────────────────────────────────────────────────────

export function formatLeaderboard(data: LeaderboardResponse): string {
  const lines = [
    `DJD Agent Leaderboard`,
    `Total scored: ${data.totalAgentsScored} | Registered: ${data.totalAgentsRegistered}`,
    `Updated: ${data.lastUpdated}`,
    '',
    '── Top agents ──',
  ]

  for (const entry of data.leaderboard.slice(0, 20)) {
    const badges = [
      entry.isRegistered ? '✓reg' : '',
      entry.githubVerified ? '✓gh' : '',
    ].filter(Boolean).join(' ')
    lines.push(
      `  #${entry.rank} ${entry.wallet} — ${entry.score} (${entry.tier}) ${entry.daysAlive}d ${badges}`.trimEnd(),
    )
  }

  if (data.leaderboard.length > 20) {
    lines.push(`  ... and ${data.leaderboard.length - 20} more`)
  }

  return lines.join('\n')
}

// ── Economy formatter ────────────────────────────────────────────────────────

export function formatEconomyMetrics(data: EconomyMetrics): string {
  const lines = [
    `Economy metrics (${data.period}, ${data.count} periods)`,
    '',
  ]

  if (data.metrics.length === 0) {
    lines.push('No metrics available for this period.')
    return lines.join('\n')
  }

  for (const m of data.metrics.slice(0, 10)) {
    const parts: string[] = []
    for (const [k, v] of Object.entries(m)) {
      parts.push(`${k}: ${v}`)
    }
    lines.push(`  ${parts.join(' | ')}`)
  }

  if (data.metrics.length > 10) {
    lines.push(`  ... and ${data.metrics.length - 10} more periods`)
  }

  return lines.join('\n')
}

// ── Batch formatter ──────────────────────────────────────────────────────────

export function formatBatchScore(data: { results: BasicScoreResponse[]; count: number }): string {
  const lines = [
    `Batch score results (${data.count} wallets)`,
    '',
  ]

  for (const r of data.results) {
    lines.push(`  ${r.wallet}: ${r.score}/100 (${r.tier}) — ${r.recommendation}`)
  }

  return lines.join('\n')
}
