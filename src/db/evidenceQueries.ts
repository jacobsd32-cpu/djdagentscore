import type { Transaction } from 'better-sqlite3'

import { log } from '../logger.js'
import { db } from './connection.js'

const stmtInsertQueryLog = db.prepare(`
  INSERT INTO query_log
    (requester_wallet, target_wallet, endpoint, tier_requested, target_score, target_tier,
     response_source, response_time_ms, user_agent, price_paid, is_free_tier, timestamp)
  VALUES
    (@requester_wallet, @target_wallet, @endpoint, @tier_requested, @target_score, @target_tier,
     @response_source, @response_time_ms, @user_agent, @price_paid, @is_free_tier, @timestamp)
`)

const stmtInsertRawTx = db.prepare(`
  INSERT OR IGNORE INTO raw_transactions
    (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
  VALUES
    (@tx_hash, @block_number, @from_wallet, @to_wallet, @amount_usdc, @timestamp)
`)

const stmtUpsertWalletFrom = db.prepare(`
  INSERT INTO wallet_index (wallet, first_seen, last_seen, total_tx_count, total_volume_out)
  VALUES (@wallet, @ts, @ts, 1, @vol)
  ON CONFLICT(wallet) DO UPDATE SET
    first_seen       = MIN(first_seen, excluded.first_seen),
    last_seen        = MAX(last_seen,  excluded.last_seen),
    total_tx_count   = total_tx_count + 1,
    total_volume_out = total_volume_out + excluded.total_volume_out
`)

const stmtUpsertWalletTo = db.prepare(`
  INSERT INTO wallet_index (wallet, first_seen, last_seen, total_tx_count, total_volume_in)
  VALUES (@wallet, @ts, @ts, 1, @vol)
  ON CONFLICT(wallet) DO UPDATE SET
    first_seen      = MIN(first_seen, excluded.first_seen),
    last_seen       = MAX(last_seen,  excluded.last_seen),
    total_tx_count  = total_tx_count + 1,
    total_volume_in = total_volume_in + excluded.total_volume_in
`)

const stmtUpsertRelationship = db.prepare(`
  INSERT INTO relationship_graph
    (wallet_a, wallet_b, tx_count_a_to_b, tx_count_b_to_a,
     total_volume_a_to_b, total_volume_b_to_a, first_interaction, last_interaction)
  VALUES
    (@wallet_a, @wallet_b, @cnt_atob, @cnt_btoa, @vol_atob, @vol_btoa, @ts, @ts)
  ON CONFLICT(wallet_a, wallet_b) DO UPDATE SET
    tx_count_a_to_b     = tx_count_a_to_b     + @cnt_atob,
    tx_count_b_to_a     = tx_count_b_to_a     + @cnt_btoa,
    total_volume_a_to_b = total_volume_a_to_b + @vol_atob,
    total_volume_b_to_a = total_volume_b_to_a + @vol_btoa,
    last_interaction    = MAX(last_interaction, excluded.last_interaction)
`)

export function insertQueryLog(entry: {
  requester_wallet: string | null
  target_wallet: string | null
  endpoint: string
  tier_requested: string | null
  target_score: number | null
  target_tier: string | null
  response_source: string | null
  response_time_ms: number
  user_agent: string | null
  price_paid: number
  is_free_tier: number
  timestamp: string
}): void {
  stmtInsertQueryLog.run(entry)
}

export function countFreeTierUsesToday(requesterKey: string): number {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const row = db
    .prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) as count FROM query_log
       WHERE requester_wallet = ?
         AND endpoint = '/v1/score/basic'
         AND is_free_tier = 1
         AND timestamp >= ?`,
    )
    .get(requesterKey, dayStart.toISOString())
  return row?.count ?? 0
}

export function countTotalQueryLogs(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM query_log').get()?.count ?? 0
}

export function countIndexedWallets(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM wallet_index').get()?.count ?? 0
}

export function getWalletX402Stats(wallet: string): {
  x402TxCount: number
  x402InflowsUsd: number
  x402OutflowsUsd: number
  x402FirstSeen: string | null
  x402LastSeen: string | null
} {
  const normalized = wallet.toLowerCase()
  const row = db
    .prepare<
      [string, string, string, string],
      {
        tx_count: number
        inflows: number
        outflows: number
        first_seen: string | null
        last_seen: string | null
      }
    >(`
      SELECT
        COUNT(*) as tx_count,
        COALESCE(SUM(CASE WHEN to_wallet = ? THEN amount_usdc ELSE 0 END), 0) as inflows,
        COALESCE(SUM(CASE WHEN from_wallet = ? THEN amount_usdc ELSE 0 END), 0) as outflows,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM raw_transactions
      WHERE from_wallet = ? OR to_wallet = ?
    `)
    .get(normalized, normalized, normalized, normalized)

  return {
    x402TxCount: row?.tx_count ?? 0,
    x402InflowsUsd: row?.inflows ?? 0,
    x402OutflowsUsd: row?.outflows ?? 0,
    x402FirstSeen: row?.first_seen ?? null,
    x402LastSeen: row?.last_seen ?? null,
  }
}

export function countUniqueCounterparties(wallet: string): number {
  const normalized = wallet.toLowerCase()
  const row = db
    .prepare<[string, string, string, string], { count: number }>(
      `SELECT COUNT(DISTINCT counterparty) as count FROM (
         SELECT to_wallet as counterparty FROM raw_transactions WHERE from_wallet = ?
         UNION
         SELECT from_wallet as counterparty FROM raw_transactions WHERE to_wallet = ?
       ) WHERE counterparty != ? AND counterparty != ?`,
    )
    .get(normalized, normalized, normalized, normalized)
  return row?.count ?? 0
}

export function getServiceLongevityDays(wallet: string): number {
  const normalized = wallet.toLowerCase()
  const row = db
    .prepare<[string, string], { first_ts: string | null; last_ts: string | null }>(
      `SELECT MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
       FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ?`,
    )
    .get(normalized, normalized)
  if (!row?.first_ts || !row?.last_ts) return 0
  const days = (new Date(row.last_ts).getTime() - new Date(row.first_ts).getTime()) / 86_400_000
  return Math.round(days * 10) / 10
}

export function getWalletIndexFirstSeen(wallet: string): string | null {
  const normalized = wallet.toLowerCase()
  try {
    const row = db
      .prepare<[string], { first_seen: string | null }>('SELECT first_seen FROM wallet_index WHERE wallet = ?')
      .get(normalized)
    return row?.first_seen ?? null
  } catch (err) {
    log.warn('db', `getWalletIndexFirstSeen query failed for ${normalized}`, err)
    return null
  }
}

export function countIndexedTransactions(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM raw_transactions').get()?.count ?? 0
}

export function countScoreOutcomes(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM score_outcomes').get()?.count ?? 0
}

export function countFraudReports(): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM fraud_reports').get()?.count ?? 0
}

export function getIndexerState(key: string): string | null {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM indexer_state WHERE key = ?').get(key)
  return row?.value ?? null
}

export function setIndexerState(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)').run(key, value)
}

export interface IndexedTransfer {
  txHash: string
  blockNumber: number
  fromWallet: string
  toWallet: string
  amountUsdc: number
  timestamp: string
}

export function countUniquePartners(wallet: string): number {
  const normalized = wallet.toLowerCase()
  const row = db
    .prepare<[string, string], { count: number }>(
      'SELECT COUNT(*) as count FROM relationship_graph WHERE wallet_a = ? OR wallet_b = ?',
    )
    .get(normalized, normalized)
  return row?.count ?? 0
}

export function countPriorQueries(wallet: string): number {
  const row = db
    .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM query_log WHERE target_wallet = ?')
    .get(wallet.toLowerCase())
  return row?.count ?? 0
}

export function getTransferTimestamps(wallet: string): string[] {
  const normalized = wallet.toLowerCase()
  let rows = db
    .prepare<[string, string], { timestamp: string }>(
      'SELECT timestamp FROM usdc_transfers WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp',
    )
    .all(normalized, normalized)

  if (rows.length >= 10) return rows.map((row) => row.timestamp)

  rows = db
    .prepare<[string, string], { timestamp: string }>(
      'SELECT timestamp FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp',
    )
    .all(normalized, normalized)

  return rows.map((row) => row.timestamp)
}

export const indexTransferBatch: Transaction<(transfers: IndexedTransfer[]) => void> = db.transaction(
  (transfers: IndexedTransfer[]) => {
    for (const transfer of transfers) {
      const from = transfer.fromWallet.toLowerCase()
      const to = transfer.toWallet.toLowerCase()

      stmtInsertRawTx.run({
        tx_hash: transfer.txHash,
        block_number: transfer.blockNumber,
        from_wallet: from,
        to_wallet: to,
        amount_usdc: transfer.amountUsdc,
        timestamp: transfer.timestamp,
      })

      stmtUpsertWalletFrom.run({ wallet: from, ts: transfer.timestamp, vol: transfer.amountUsdc })
      stmtUpsertWalletTo.run({ wallet: to, ts: transfer.timestamp, vol: transfer.amountUsdc })

      const [walletA, walletB] = from < to ? [from, to] : [to, from]
      const isAtoB = from < to

      stmtUpsertRelationship.run({
        wallet_a: walletA,
        wallet_b: walletB,
        cnt_atob: isAtoB ? 1 : 0,
        cnt_btoa: isAtoB ? 0 : 1,
        vol_atob: isAtoB ? transfer.amountUsdc : 0,
        vol_btoa: isAtoB ? 0 : transfer.amountUsdc,
        ts: transfer.timestamp,
      })
    }
  },
)

export interface WebhookRow {
  id: number
  wallet: string
  url: string
  secret: string
  events: string
  tier: string
  is_active: number
  created_at: string
  failure_count: number
  last_delivery_at: string | null
  disabled_at: string | null
  threshold_score?: number | null
}

export interface WebhookDeliveryRow {
  id: number
  event_type: string
  status_code: number | null
  attempt: number
  delivered_at: string | null
  created_at: string
}

const stmtInsertWebhook = db.prepare<[string, string, string, string, string]>(`
  INSERT INTO webhooks (wallet, url, secret, events, tier)
  VALUES (?, ?, ?, ?, ?)
`)

const stmtGetWebhookById = db.prepare<[number], WebhookRow>('SELECT * FROM webhooks WHERE id = ?')

const stmtListWebhooks = db.prepare<[], WebhookRow>('SELECT * FROM webhooks ORDER BY created_at DESC')

const stmtListRecentWebhookDeliveries = db.prepare<[number, number], WebhookDeliveryRow>(`
  SELECT id, event_type, status_code, attempt, delivered_at, created_at
  FROM webhook_deliveries
  WHERE webhook_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`)

const stmtDeactivateWebhook = db.prepare(`
  UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND is_active = 1
`)

const stmtCountActiveWebhooksForWallet = db.prepare<[string], { count: number }>(
  'SELECT COUNT(*) as count FROM webhooks WHERE wallet = ? AND is_active = 1',
)

const stmtListWebhooksForWallet = db.prepare<[string], WebhookRow>(
  'SELECT * FROM webhooks WHERE wallet = ? ORDER BY created_at DESC',
)

const stmtDeactivateWebhookForWallet = db.prepare(`
  UPDATE webhooks SET is_active = 0, disabled_at = datetime('now') WHERE id = ? AND wallet = ? AND is_active = 1
`)

export function insertWebhook(input: {
  wallet: string
  url: string
  secret: string
  events: string[]
  tier: string
}): WebhookRow {
  const result = stmtInsertWebhook.run(
    input.wallet,
    input.url,
    input.secret,
    JSON.stringify(input.events),
    input.tier,
  )

  return stmtGetWebhookById.get(Number(result.lastInsertRowid))!
}

export function listWebhooks(): WebhookRow[] {
  return stmtListWebhooks.all()
}

export function getWebhookById(id: number): WebhookRow | undefined {
  return stmtGetWebhookById.get(id)
}

export function listRecentWebhookDeliveries(webhookId: number, limit = 20): WebhookDeliveryRow[] {
  return stmtListRecentWebhookDeliveries.all(webhookId, limit)
}

export function deactivateWebhook(id: number): boolean {
  return stmtDeactivateWebhook.run(id).changes > 0
}

export function countActiveWebhooksForWallet(wallet: string): number {
  return stmtCountActiveWebhooksForWallet.get(wallet)?.count ?? 0
}

export function listWebhooksForWallet(wallet: string): WebhookRow[] {
  return stmtListWebhooksForWallet.all(wallet)
}

export function deactivateWebhookForWallet(id: number, wallet: string): boolean {
  return stmtDeactivateWebhookForWallet.run(id, wallet).changes > 0
}
