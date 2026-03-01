/**
 * MCP tool registrations for the DJD Agent Score API.
 *
 * Each tool maps to one API endpoint. Free tools work without an API key
 * (10 queries/day); paid tools require DJD_API_KEY with credits.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { DJDClient } from './client.js'
import type {
  BasicScoreResponse,
  FullScoreResponse,
  LeaderboardResponse,
  EconomyMetrics,
} from 'djd-agent-score-client'
import {
  formatBasicScore,
  formatFullScore,
  formatHistory,
  formatLeaderboard,
  formatEconomyMetrics,
  formatBatchScore,
} from './format.js'
import type { HistoryResponse } from './format.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const }
}

async function callTool<T>(fn: () => Promise<T>, formatter: (data: T) => string) {
  try {
    const data = await fn()
    return textResult(formatter(data))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return errorResult(message)
  }
}

// ── Wallet schema (reused across tools) ──────────────────────────────────────

const walletSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address (0x + 40 hex chars)')

// ── Tool registration ────────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: DJDClient): void {
  // 1. Basic score (free, 10/day)
  server.tool(
    'get_score',
    'Get the DJD reputation score for an Ethereum wallet. Returns score (0-100), trust tier, confidence level, and recommendation. Free tier: 10 queries/day.',
    { wallet: walletSchema },
    async ({ wallet }) =>
      callTool(
        () => client.get<BasicScoreResponse>(`/v1/score/basic?wallet=${wallet}`),
        formatBasicScore,
      ),
  )

  // 2. Full score with dimensions ($0.10 — needs API key)
  server.tool(
    'get_full_score',
    'Get detailed DJD reputation breakdown: reliability, viability, identity, capability dimensions plus sybil detection, gaming indicators, and improvement paths. Requires API key ($0.10/query).',
    { wallet: walletSchema },
    async ({ wallet }) =>
      callTool(
        () => client.get<FullScoreResponse>(`/v1/score/full?wallet=${wallet}`),
        formatFullScore,
      ),
  )

  // 3. Score history with trajectory ($0.15 — needs API key)
  server.tool(
    'get_score_history',
    'Get historical score data for a wallet with trend analysis and trajectory metrics (velocity, momentum, direction). Requires API key ($0.15/query).',
    {
      wallet: walletSchema,
      limit: z.number().int().min(1).max(100).default(50).describe('Max entries to return (1-100)'),
      after: z.string().optional().describe('Only scores after this ISO date (YYYY-MM-DD)'),
      before: z.string().optional().describe('Only scores before this ISO date (YYYY-MM-DD)'),
    },
    async ({ wallet, limit, after, before }) => {
      let path = `/v1/score/history?wallet=${wallet}&limit=${limit}`
      if (after) path += `&after=${after}`
      if (before) path += `&before=${before}`

      return callTool(
        () => client.get<HistoryResponse>(path),
        formatHistory,
      )
    },
  )

  // 4. Leaderboard (free)
  server.tool(
    'get_leaderboard',
    'Get the DJD agent leaderboard — top-scoring wallets ranked by reputation. Includes registration status and GitHub verification. Free endpoint.',
    {},
    async () =>
      callTool(
        () => client.get<LeaderboardResponse>('/v1/leaderboard'),
        formatLeaderboard,
      ),
  )

  // 5. Economy metrics (free)
  server.tool(
    'get_economy_metrics',
    'Get DJD network health metrics: scoring volume, agent registrations, and economy stats. Free endpoint.',
    {
      period: z.enum(['daily', 'weekly', 'monthly']).default('daily').describe('Aggregation period'),
      limit: z.number().int().min(1).max(90).default(30).describe('Number of periods to return'),
    },
    async ({ period, limit }) =>
      callTool(
        () => client.get<EconomyMetrics>(`/v1/data/economy?period=${period}&limit=${limit}`),
        formatEconomyMetrics,
      ),
  )

  // 6. Batch score (2-20 wallets, $0.50 — needs API key)
  server.tool(
    'batch_score',
    'Score multiple wallets in one request (2-20 addresses). Returns basic score for each. Requires API key ($0.50/batch).',
    {
      wallets: z
        .array(walletSchema)
        .min(2)
        .max(20)
        .describe('Array of 2-20 Ethereum wallet addresses to score'),
    },
    async ({ wallets }) =>
      callTool(
        () => client.post<{ results: BasicScoreResponse[]; count: number }>('/v1/score/batch', { wallets }),
        formatBatchScore,
      ),
  )
}
