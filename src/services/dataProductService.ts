import {
  countScoreDecay,
  getIntentSummaryByTarget,
  getIntentTierBreakdownByTarget,
  getRelationshipGraphSummary,
  getScore,
  listIntentSignalsByTarget,
  listRelationshipCounterparties,
  listScoreDecay,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import { computeTrajectory } from '../scoring/trajectory.js'
import type { Address } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'

const DEFAULT_DECAY_LIMIT = 50
const MAX_DECAY_LIMIT = 100
const DEFAULT_GRAPH_LIMIT = 25
const MAX_GRAPH_LIMIT = 100
const DEFAULT_INTENT_LIMIT = 25
const MAX_INTENT_LIMIT = 100

interface DataProductServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 404
  details?: Record<string, unknown>
}

interface DataProductServiceSuccess<T> {
  ok: true
  data: T
}

type DataProductServiceResult<T> = DataProductServiceError | DataProductServiceSuccess<T>

interface TrendSummary {
  direction: string
  change_pct: number
  avg_score: number
  min_score: number
  max_score: number
}

interface DecayParams {
  rawWallet: string | undefined
  limit: string | undefined
  after: string | undefined
  before: string | undefined
}

interface GraphParams {
  rawWallet: string | undefined
  limit: string | undefined
}

interface IntentParams {
  rawWallet: string | undefined
  limit: string | undefined
}

function invalidWalletError(message: string): DataProductServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message,
    status: 400,
  }
}

function invalidDateRangeError(field: 'after' | 'before'): DataProductServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_DATE_RANGE,
    message: `Invalid "${field}" date format. Use ISO 8601 (YYYY-MM-DD)`,
    status: 400,
  }
}

function notFoundError(message: string): DataProductServiceError {
  return {
    ok: false,
    code: ErrorCodes.WALLET_NOT_FOUND,
    message,
    status: 404,
  }
}

function parseClampedLimit(rawLimit: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(rawLimit ?? String(fallback), 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), max)
}

function buildTrend(scores: number[]): TrendSummary | null {
  if (scores.length < 2) return null

  const latest = scores[0]!
  const earliest = scores[scores.length - 1]!
  const change = latest - earliest
  const changePct = earliest !== 0 ? (change / earliest) * 100 : 0
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const direction = Math.abs(change) <= 5 ? 'stable' : change > 0 ? 'improving' : 'declining'

  return {
    direction,
    change_pct: Math.round(changePct * 10) / 10,
    avg_score: Math.round(avg * 10) / 10,
    min_score: Math.min(...scores),
    max_score: Math.max(...scores),
  }
}

function parseWallet(rawWallet: string | undefined): Address | DataProductServiceError {
  const wallet = normalizeWallet(rawWallet)
  if (!wallet) {
    return invalidWalletError('Valid Ethereum wallet address required')
  }

  return wallet
}

function isServiceError<T>(value: T | DataProductServiceError): value is DataProductServiceError {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}

export function getScoreDecayView(params: DecayParams): DataProductServiceResult<{
  wallet: Address
  current_score: number | null
  current_tier: string | null
  decay: Array<{
    score: number
    recorded_at: string
  }>
  count: number
  returned: number
  period: {
    from: string | null
    to: string | null
  }
  trend?: TrendSummary
  trajectory: {
    velocity: number | null
    momentum: number | null
    direction: 'improving' | 'declining' | 'stable' | 'volatile' | 'new'
    volatility: number
    modifier: number
    dataPoints: number
    spanDays: number
  }
}> {
  const wallet = parseWallet(params.rawWallet)
  if (isServiceError(wallet)) return wallet

  if (params.after && Number.isNaN(Date.parse(params.after))) {
    return invalidDateRangeError('after')
  }
  if (params.before && Number.isNaN(Date.parse(params.before))) {
    return invalidDateRangeError('before')
  }

  const limit = parseClampedLimit(params.limit, DEFAULT_DECAY_LIMIT, MAX_DECAY_LIMIT)
  const rows = listScoreDecay(wallet, {
    after: params.after,
    before: params.before,
    limit,
  })

  if (rows.length === 0) {
    return notFoundError('No score decay data found for this wallet')
  }

  const totalCount = countScoreDecay(wallet, {
    after: params.after,
    before: params.before,
  })
  const score = getScore(wallet)
  const scores = rows.map((row) => row.composite_score)
  const trajectory = computeTrajectory({
    scores: rows.map((row) => ({ score: row.composite_score, calculatedAt: row.recorded_at })),
  })
  const trend = buildTrend(scores)

  return {
    ok: true,
    data: {
      wallet,
      current_score: score?.composite_score ?? rows[0]!.composite_score,
      current_tier: score?.tier ?? null,
      decay: rows.map((row) => ({
        score: row.composite_score,
        recorded_at: row.recorded_at,
      })),
      count: totalCount,
      returned: rows.length,
      period: {
        from: params.after ?? rows[rows.length - 1]!.recorded_at,
        to: params.before ?? rows[0]!.recorded_at,
      },
      ...(trend ? { trend } : {}),
      trajectory: {
        velocity: trajectory.velocity,
        momentum: trajectory.momentum,
        direction: trajectory.direction,
        volatility: trajectory.volatility,
        modifier: trajectory.modifier,
        dataPoints: trajectory.dataPoints,
        spanDays: trajectory.spanDays,
      },
    },
  }
}

export function getRelationshipGraphView(params: GraphParams): DataProductServiceResult<{
  wallet: Address
  current_score: number | null
  current_tier: string | null
  sybil_flagged: boolean
  counterparties: Array<{
    rank: number
    wallet: Address
    tx_count_outbound: number
    tx_count_inbound: number
    total_tx_count: number
    volume_outbound: number
    volume_inbound: number
    total_volume: number
    first_interaction: string
    last_interaction: string
  }>
  count: number
  returned: number
  summary: {
    counterparty_count: number
    outbound_tx_count: number
    inbound_tx_count: number
    total_tx_count: number
    volume_outbound: number
    volume_inbound: number
    total_volume: number
    first_interaction: string | null
    last_interaction: string | null
  }
}> {
  const wallet = parseWallet(params.rawWallet)
  if (isServiceError(wallet)) return wallet

  const limit = parseClampedLimit(params.limit, DEFAULT_GRAPH_LIMIT, MAX_GRAPH_LIMIT)
  const summary = getRelationshipGraphSummary(wallet)
  if (summary.counterparty_count === 0) {
    return notFoundError('No relationship graph data found for this wallet')
  }

  const score = getScore(wallet)
  const rows = listRelationshipCounterparties(wallet, { limit })

  return {
    ok: true,
    data: {
      wallet,
      current_score: score?.composite_score ?? null,
      current_tier: score?.tier ?? null,
      sybil_flagged: score?.sybil_flag === 1,
      counterparties: rows.map((row, index) => ({
        rank: index + 1,
        wallet: row.counterparty_wallet as Address,
        tx_count_outbound: row.tx_count_outbound,
        tx_count_inbound: row.tx_count_inbound,
        total_tx_count: row.total_tx_count,
        volume_outbound: row.volume_outbound,
        volume_inbound: row.volume_inbound,
        total_volume: row.total_volume,
        first_interaction: row.first_interaction,
        last_interaction: row.last_interaction,
      })),
      count: summary.counterparty_count,
      returned: rows.length,
      summary,
    },
  }
}

export function getIntentSignalsView(params: IntentParams): DataProductServiceResult<{
  wallet: Address
  current_score: number | null
  current_tier: string | null
  summary: {
    intent_count: number
    conversions: number
    conversion_rate: number
    avg_time_to_tx_ms: number | null
    avg_time_to_tx_hours: number | null
    most_recent_query_at: string | null
    most_recent_conversion_at: string | null
  }
  by_tier: Array<{
    tier_requested: string
    count: number
    conversions: number
    conversion_rate: number
  }>
  intents: Array<{
    counterparty_wallet: Address
    query_timestamp: string
    followed_by_tx: boolean
    tx_hash: string | null
    tx_timestamp: string | null
    time_to_tx_ms: number | null
    endpoint: string | null
    tier_requested: string | null
    price_paid: number | null
  }>
  count: number
  returned: number
}> {
  const wallet = parseWallet(params.rawWallet)
  if (isServiceError(wallet)) return wallet

  const summary = getIntentSummaryByTarget(wallet)
  if (summary.intent_count === 0) {
    return notFoundError('No intent data found for this wallet')
  }

  const limit = parseClampedLimit(params.limit, DEFAULT_INTENT_LIMIT, MAX_INTENT_LIMIT)
  const rows = listIntentSignalsByTarget(wallet, { limit })
  const tierBreakdown = getIntentTierBreakdownByTarget(wallet)
  const score = getScore(wallet)

  return {
    ok: true,
    data: {
      wallet,
      current_score: score?.composite_score ?? null,
      current_tier: score?.tier ?? null,
      summary: {
        intent_count: summary.intent_count,
        conversions: summary.conversions,
        conversion_rate: summary.conversion_rate,
        avg_time_to_tx_ms: summary.avg_time_to_tx_ms,
        avg_time_to_tx_hours:
          summary.avg_time_to_tx_ms !== null ? Math.round((summary.avg_time_to_tx_ms / 3_600_000) * 100) / 100 : null,
        most_recent_query_at: summary.most_recent_query_at,
        most_recent_conversion_at: summary.most_recent_conversion_at,
      },
      by_tier: tierBreakdown.map((row) => ({
        tier_requested: row.tier_requested,
        count: row.count,
        conversions: row.conversions,
        conversion_rate: row.count > 0 ? Math.round((row.conversions * 1000) / row.count) / 10 : 0,
      })),
      intents: rows.map((row) => ({
        counterparty_wallet: row.requester_wallet as Address,
        query_timestamp: row.query_timestamp,
        followed_by_tx: row.followed_by_tx === 1,
        tx_hash: row.tx_hash,
        tx_timestamp: row.tx_timestamp,
        time_to_tx_ms: row.time_to_tx_ms,
        endpoint: row.endpoint,
        tier_requested: row.tier_requested,
        price_paid: row.price_paid,
      })),
      count: summary.intent_count,
      returned: rows.length,
    },
  }
}
