import type { Database } from 'better-sqlite3'

export interface UsdcTransfer {
  txHash: string
  blockNumber: number
  fromWallet: string
  toWallet: string
  amountUsdc: number
  timestamp: string
}

/**
 * Batch-insert USDC transfers. Returns count of newly inserted rows.
 * Duplicates (by tx_hash) are silently ignored.
 */
export function indexUsdcTransferBatch(db: Database, transfers: UsdcTransfer[]): number {
  if (transfers.length === 0) return 0

  const insert = db.prepare(`
    INSERT OR IGNORE INTO usdc_transfers (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let inserted = 0
  const txn = db.transaction(() => {
    for (const t of transfers) {
      const result = insert.run(
        t.txHash,
        t.blockNumber,
        t.fromWallet.toLowerCase(),
        t.toWallet.toLowerCase(),
        t.amountUsdc,
        t.timestamp,
      )
      if (result.changes > 0) inserted++
    }
  })
  txn()
  return inserted
}

/**
 * Refresh wallet_transfer_stats for the given wallets by aggregating from usdc_transfers.
 */
export function refreshWalletTransferStats(db: Database, wallets: string[]): void {
  const upsert = db.prepare(`
    INSERT INTO wallet_transfer_stats (wallet, total_tx_count, total_volume_in, total_volume_out, unique_partners, first_seen, last_seen, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wallet) DO UPDATE SET
      total_tx_count = excluded.total_tx_count,
      total_volume_in = excluded.total_volume_in,
      total_volume_out = excluded.total_volume_out,
      unique_partners = excluded.unique_partners,
      first_seen = excluded.first_seen,
      last_seen = excluded.last_seen,
      updated_at = datetime('now')
  `)

  const txn = db.transaction(() => {
    for (const wallet of wallets) {
      const w = wallet.toLowerCase()

      const outgoing = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_usdc), 0) as vol,
               MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
        FROM usdc_transfers WHERE from_wallet = ?
      `).get(w) as { cnt: number; vol: number; first_ts: string | null; last_ts: string | null }

      const incoming = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_usdc), 0) as vol,
               MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
        FROM usdc_transfers WHERE to_wallet = ?
      `).get(w) as { cnt: number; vol: number; first_ts: string | null; last_ts: string | null }

      const partners = db.prepare(`
        SELECT COUNT(DISTINCT partner) as cnt FROM (
          SELECT to_wallet as partner FROM usdc_transfers WHERE from_wallet = ?
          UNION
          SELECT from_wallet as partner FROM usdc_transfers WHERE to_wallet = ?
        )
      `).get(w, w) as { cnt: number }

      const totalTx = outgoing.cnt + incoming.cnt
      const timestamps = [outgoing.first_ts, incoming.first_ts, outgoing.last_ts, incoming.last_ts].filter(Boolean) as string[]
      const firstSeen = timestamps.length > 0 ? timestamps.sort()[0] : null
      const lastSeen = timestamps.length > 0 ? timestamps.sort().reverse()[0] : null

      upsert.run(w, totalTx, incoming.vol, outgoing.vol, partners.cnt, firstSeen, lastSeen)
    }
  })
  txn()
}
