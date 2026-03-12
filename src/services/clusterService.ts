import {
  countClusterMembers,
  getRelationshipGraphSummary,
  listClusterMembers,
  listRelationshipCounterparties,
  upsertClusterAssignment,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import type { Address } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import { getRiskScore, type RiskScoreView } from './riskService.js'

type ClusterName =
  | 'organic_network'
  | 'repeat_counterparty_network'
  | 'broker_hub'
  | 'sybil_ring'
  | 'fraud_hotspot'
  | 'isolated_newcomer'

interface ClusterServiceError {
  ok: false
  code: string
  message: string
  status: 400
  details?: Record<string, unknown>
}

interface ClusterServiceSuccess<T> {
  ok: true
  data: T
}

export type ClusterServiceResult<T> = ClusterServiceError | ClusterServiceSuccess<T>

interface ClusterParams {
  rawWallet: string | undefined
  limit: string | undefined
}

interface ClusterClassification {
  cluster_name: ClusterName
  cluster_id: string
  confidence: number
  evidence: string[]
}

const DEFAULT_CLUSTER_LIMIT = 10
const MAX_CLUSTER_LIMIT = 25

function invalidWalletError(): ClusterServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message: 'Invalid or missing wallet address',
    status: 400,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseClampedLimit(rawLimit: string | undefined): number {
  const parsed = Number.parseInt(rawLimit ?? String(DEFAULT_CLUSTER_LIMIT), 10)
  if (Number.isNaN(parsed)) return DEFAULT_CLUSTER_LIMIT
  return Math.min(Math.max(parsed, 1), MAX_CLUSTER_LIMIT)
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeAnchor(value: string): string {
  return value.toLowerCase().slice(0, 18)
}

function buildClusterId(
  clusterName: ClusterName,
  wallet: string,
  primaryCounterparty: string | null,
  topReason: string | null,
): string {
  if (clusterName === 'broker_hub') {
    return `${clusterName}:${normalizeAnchor(wallet)}`
  }
  if (clusterName === 'fraud_hotspot' && topReason) {
    return `${clusterName}:${topReason}:${normalizeAnchor(primaryCounterparty ?? wallet)}`
  }
  if (clusterName === 'isolated_newcomer') {
    return `${clusterName}:${normalizeAnchor(wallet)}`
  }
  return `${clusterName}:${normalizeAnchor(primaryCounterparty ?? wallet)}`
}

function buildClassification(
  wallet: string,
  risk: RiskScoreView,
  graph: ReturnType<typeof getRelationshipGraphSummary>,
  counterparties: ReturnType<typeof listRelationshipCounterparties>,
): ClusterClassification {
  const primaryCounterparty = counterparties[0]?.counterparty_wallet ?? null
  const topReason = risk.summary.reason_breakdown[0]?.reason ?? null
  const sybilIndicators = risk.summary.sybil_indicators
  const hasRingSignals =
    risk.summary.sybil_flagged ||
    sybilIndicators.some((indicator) =>
      ['tight_cluster', 'coordinated_creation', 'funded_by_top_partner', 'single_partner'].includes(indicator),
    )

  const evidence: string[] = []
  let clusterName: ClusterName

  if (hasRingSignals && (graph.counterparty_count >= 2 || risk.summary.report_count >= 1)) {
    clusterName = 'sybil_ring'
    evidence.push('Sybil indicators overlap with a repeat counterparty cluster.')
  } else if (
    risk.summary.report_count >= 2 ||
    risk.risk_level === 'critical' ||
    risk.summary.total_penalty_applied >= 10
  ) {
    clusterName = 'fraud_hotspot'
    evidence.push('Repeated fraud pressure or penalties point to a high-risk neighborhood.')
  } else if (graph.counterparty_count >= 12 && graph.total_tx_count >= 40) {
    clusterName = 'broker_hub'
    evidence.push('Large and active transaction graph suggests hub-like routing behavior.')
  } else if (graph.counterparty_count >= 4 && graph.total_tx_count >= 12) {
    clusterName = 'repeat_counterparty_network'
    evidence.push('Wallet transacts repeatedly with a stable counterparties set.')
  } else if (graph.counterparty_count <= 1 && risk.current_score < 50) {
    clusterName = 'isolated_newcomer'
    evidence.push('Sparse graph and low score indicate an early or weakly connected wallet.')
  } else {
    clusterName = 'organic_network'
    evidence.push('No concentrated risk or graph anomaly; activity looks broadly organic.')
  }

  if (risk.summary.reason_breakdown.length > 0) {
    evidence.push(`Top reason observed: ${risk.summary.reason_breakdown[0]!.reason}.`)
  }
  if (primaryCounterparty) {
    evidence.push(`Primary graph anchor: ${primaryCounterparty}.`)
  }

  const confidence = round(
    clamp(
      risk.risk_confidence * 0.5 +
        Math.min(0.18, counterparties.length * 0.03) +
        (graph.total_tx_count >= 20 ? 0.08 : 0) +
        (risk.summary.report_count > 0 ? 0.08 : 0) +
        (hasRingSignals ? 0.1 : 0) +
        (clusterName === 'organic_network' ? -0.05 : 0),
      0.35,
      0.95,
    ),
  )

  return {
    cluster_name: clusterName,
    cluster_id: buildClusterId(clusterName, wallet, primaryCounterparty, topReason),
    confidence,
    evidence,
  }
}

export async function getClusterView(params: ClusterParams): Promise<
  ClusterServiceResult<{
    wallet: Address
    cluster_id: string
    cluster_name: ClusterName
    confidence: number
    assigned_at: string
    source: 'inferred'
    member_count: number
    current_score: number
    current_tier: string
    risk_level: RiskScoreView['risk_level']
    summary: {
      counterparty_count: number
      total_tx_count: number
      total_volume: number
      report_count: number
      unique_reporters: number
      total_penalty_applied: number
      sybil_flagged: boolean
    }
    evidence: string[]
    members: Array<{
      wallet: string
      cluster_name: string
      confidence: number
      assigned_at: string
      current_score: number | null
      current_tier: string | null
    }>
    linked_wallets: Array<{
      rank: number
      wallet: Address
      total_tx_count: number
      total_volume: number
      last_interaction: string
      relationship_strength: 'primary' | 'secondary'
    }>
  }>
> {
  const wallet = normalizeWallet(params.rawWallet)
  if (!wallet) return invalidWalletError()

  const limit = parseClampedLimit(params.limit)
  const risk = await getRiskScore(wallet)
  if (!risk.ok) {
    return risk
  }

  const graph = getRelationshipGraphSummary(wallet)
  const counterparties = listRelationshipCounterparties(wallet, { limit })
  const classification = buildClassification(wallet, risk.data, graph, counterparties)
  const assignedAt = new Date().toISOString()

  upsertClusterAssignment({
    wallet,
    cluster_id: classification.cluster_id,
    cluster_name: classification.cluster_name,
    confidence: classification.confidence,
    assigned_at: assignedAt,
  })

  const members = listClusterMembers(classification.cluster_id, {
    limit,
    excludeWallet: wallet,
  })

  return {
    ok: true,
    data: {
      wallet,
      cluster_id: classification.cluster_id,
      cluster_name: classification.cluster_name,
      confidence: classification.confidence,
      assigned_at: assignedAt,
      source: 'inferred',
      member_count: Math.max(1, countClusterMembers(classification.cluster_id)),
      current_score: risk.data.current_score,
      current_tier: risk.data.current_tier,
      risk_level: risk.data.risk_level,
      summary: {
        counterparty_count: graph.counterparty_count,
        total_tx_count: graph.total_tx_count,
        total_volume: round(graph.total_volume),
        report_count: risk.data.summary.report_count,
        unique_reporters: risk.data.summary.unique_reporters,
        total_penalty_applied: risk.data.summary.total_penalty_applied,
        sybil_flagged: risk.data.summary.sybil_flagged,
      },
      evidence: classification.evidence,
      members: members.map((member) => ({
        wallet: member.wallet,
        cluster_name: member.cluster_name,
        confidence: round(member.confidence),
        assigned_at: member.assigned_at,
        current_score: member.current_score,
        current_tier: member.current_tier,
      })),
      linked_wallets: counterparties.map((row, index) => ({
        rank: index + 1,
        wallet: row.counterparty_wallet as Address,
        total_tx_count: row.total_tx_count,
        total_volume: round(row.total_volume),
        last_interaction: row.last_interaction,
        relationship_strength: index < 2 ? 'primary' : 'secondary',
      })),
    },
  }
}
