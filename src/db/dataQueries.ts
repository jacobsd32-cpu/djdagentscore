import { db } from './connection.js'

export interface ScoreDecayPointRow {
  wallet: string
  composite_score: number
  recorded_at: string
}

export interface RelationshipGraphSummaryRow {
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

export interface RelationshipCounterpartyRow {
  counterparty_wallet: string
  tx_count_outbound: number
  tx_count_inbound: number
  total_tx_count: number
  volume_outbound: number
  volume_inbound: number
  total_volume: number
  first_interaction: string
  last_interaction: string
}

export interface IntentSummaryRow {
  intent_count: number
  conversions: number
  conversion_rate: number
  avg_time_to_tx_ms: number | null
  most_recent_query_at: string | null
  most_recent_conversion_at: string | null
}

export interface IntentSignalRow {
  requester_wallet: string
  query_timestamp: string
  followed_by_tx: number
  tx_hash: string | null
  tx_timestamp: string | null
  time_to_tx_ms: number | null
  endpoint: string | null
  tier_requested: string | null
  price_paid: number | null
}

export interface IntentTierBreakdownRow {
  tier_requested: string
  count: number
  conversions: number
}

export function listScoreDecay(
  wallet: string,
  options: {
    after?: string
    before?: string
    limit: number
  },
): ScoreDecayPointRow[] {
  let sql = 'SELECT wallet, composite_score, recorded_at FROM score_decay WHERE wallet = ?'
  const args: Array<string | number> = [wallet]

  if (options.after) {
    sql += ' AND recorded_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND recorded_at <= ?'
    args.push(options.before)
  }

  sql += ' ORDER BY recorded_at DESC LIMIT ?'
  args.push(options.limit)

  return db.prepare(sql).all(...args) as ScoreDecayPointRow[]
}

export function countScoreDecay(
  wallet: string,
  options: {
    after?: string
    before?: string
  } = {},
): number {
  let sql = 'SELECT COUNT(*) as count FROM score_decay WHERE wallet = ?'
  const args: string[] = [wallet]

  if (options.after) {
    sql += ' AND recorded_at >= ?'
    args.push(options.after)
  }
  if (options.before) {
    sql += ' AND recorded_at <= ?'
    args.push(options.before)
  }

  return (db.prepare(sql).get(...args) as { count: number } | undefined)?.count ?? 0
}

export function getRelationshipGraphSummary(wallet: string): RelationshipGraphSummaryRow {
  const row = db
    .prepare<[string, string, string, string, string, string], RelationshipGraphSummaryRow>(
      `
        SELECT
          COUNT(*) as counterparty_count,
          COALESCE(SUM(CASE WHEN wallet_a = ? THEN tx_count_a_to_b ELSE tx_count_b_to_a END), 0) as outbound_tx_count,
          COALESCE(SUM(CASE WHEN wallet_a = ? THEN tx_count_b_to_a ELSE tx_count_a_to_b END), 0) as inbound_tx_count,
          COALESCE(SUM(tx_count_a_to_b + tx_count_b_to_a), 0) as total_tx_count,
          COALESCE(SUM(CASE WHEN wallet_a = ? THEN total_volume_a_to_b ELSE total_volume_b_to_a END), 0) as volume_outbound,
          COALESCE(SUM(CASE WHEN wallet_a = ? THEN total_volume_b_to_a ELSE total_volume_a_to_b END), 0) as volume_inbound,
          COALESCE(SUM(total_volume_a_to_b + total_volume_b_to_a), 0) as total_volume,
          MIN(first_interaction) as first_interaction,
          MAX(last_interaction) as last_interaction
        FROM relationship_graph
        WHERE wallet_a = ? OR wallet_b = ?
      `,
    )
    .get(wallet, wallet, wallet, wallet, wallet, wallet)

  return (
    row ?? {
      counterparty_count: 0,
      outbound_tx_count: 0,
      inbound_tx_count: 0,
      total_tx_count: 0,
      volume_outbound: 0,
      volume_inbound: 0,
      total_volume: 0,
      first_interaction: null,
      last_interaction: null,
    }
  )
}

export function listRelationshipCounterparties(
  wallet: string,
  options: {
    limit: number
  },
): RelationshipCounterpartyRow[] {
  return db
    .prepare<[string, string, string, string, string, string, string, number], RelationshipCounterpartyRow>(
      `
        SELECT
          CASE WHEN wallet_a = ? THEN wallet_b ELSE wallet_a END as counterparty_wallet,
          CASE WHEN wallet_a = ? THEN tx_count_a_to_b ELSE tx_count_b_to_a END as tx_count_outbound,
          CASE WHEN wallet_a = ? THEN tx_count_b_to_a ELSE tx_count_a_to_b END as tx_count_inbound,
          (tx_count_a_to_b + tx_count_b_to_a) as total_tx_count,
          CASE WHEN wallet_a = ? THEN total_volume_a_to_b ELSE total_volume_b_to_a END as volume_outbound,
          CASE WHEN wallet_a = ? THEN total_volume_b_to_a ELSE total_volume_a_to_b END as volume_inbound,
          (total_volume_a_to_b + total_volume_b_to_a) as total_volume,
          first_interaction,
          last_interaction
        FROM relationship_graph
        WHERE wallet_a = ? OR wallet_b = ?
        ORDER BY total_volume DESC, total_tx_count DESC, last_interaction DESC
        LIMIT ?
      `,
    )
    .all(wallet, wallet, wallet, wallet, wallet, wallet, wallet, options.limit)
}

export function getIntentSummaryByTarget(wallet: string): IntentSummaryRow {
  const row = db
    .prepare<[string], IntentSummaryRow>(
      `
        SELECT
          COUNT(*) as intent_count,
          COALESCE(SUM(followed_by_tx), 0) as conversions,
          ROUND(
            CASE
              WHEN COUNT(*) = 0 THEN 0
              ELSE (COALESCE(SUM(followed_by_tx), 0) * 100.0) / COUNT(*)
            END,
            1
          ) as conversion_rate,
          ROUND(AVG(CASE WHEN followed_by_tx = 1 THEN time_to_tx_ms END), 0) as avg_time_to_tx_ms,
          MAX(query_timestamp) as most_recent_query_at,
          MAX(CASE WHEN followed_by_tx = 1 THEN tx_timestamp END) as most_recent_conversion_at
        FROM intent_signals
        WHERE target_wallet = ?
      `,
    )
    .get(wallet)

  return (
    row ?? {
      intent_count: 0,
      conversions: 0,
      conversion_rate: 0,
      avg_time_to_tx_ms: null,
      most_recent_query_at: null,
      most_recent_conversion_at: null,
    }
  )
}

export function listIntentSignalsByTarget(
  wallet: string,
  options: {
    limit: number
  },
): IntentSignalRow[] {
  return db
    .prepare<[string, number], IntentSignalRow>(
      `
        SELECT
          i.requester_wallet,
          i.query_timestamp,
          i.followed_by_tx,
          i.tx_hash,
          i.tx_timestamp,
          i.time_to_tx_ms,
          ql.endpoint,
          ql.tier_requested,
          ql.price_paid
        FROM intent_signals i
        LEFT JOIN query_log ql
          ON ql.id = (
            SELECT ql2.id
            FROM query_log ql2
            WHERE ql2.requester_wallet = i.requester_wallet
              AND ql2.target_wallet = i.target_wallet
              AND ql2.timestamp = i.query_timestamp
            ORDER BY ql2.id DESC
            LIMIT 1
          )
        WHERE i.target_wallet = ?
        ORDER BY i.query_timestamp DESC
        LIMIT ?
      `,
    )
    .all(wallet, options.limit)
}

export function getIntentTierBreakdownByTarget(wallet: string): IntentTierBreakdownRow[] {
  return db
    .prepare<[string], IntentTierBreakdownRow>(
      `
        SELECT
          COALESCE(ql.tier_requested, 'unknown') as tier_requested,
          COUNT(*) as count,
          COALESCE(SUM(i.followed_by_tx), 0) as conversions
        FROM intent_signals i
        LEFT JOIN query_log ql
          ON ql.id = (
            SELECT ql2.id
            FROM query_log ql2
            WHERE ql2.requester_wallet = i.requester_wallet
              AND ql2.target_wallet = i.target_wallet
              AND ql2.timestamp = i.query_timestamp
            ORDER BY ql2.id DESC
            LIMIT 1
          )
        WHERE i.target_wallet = ?
        GROUP BY COALESCE(ql.tier_requested, 'unknown')
        ORDER BY count DESC, tier_requested ASC
      `,
    )
    .all(wallet)
}
