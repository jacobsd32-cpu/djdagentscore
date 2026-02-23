import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from '../src/jobs/usdcTransferHelpers.js'

describe('indexUsdcTransferBatch', () => {
  it('inserts transfers and ignores duplicates', () => {
    const db = createTestDb()
    const transfers = [
      { txHash: '0xaaa', blockNumber: 100, fromWallet: '0x1', toWallet: '0x2', amountUsdc: 0.50, timestamp: '2026-01-01T00:00:00Z' },
      { txHash: '0xbbb', blockNumber: 101, fromWallet: '0x2', toWallet: '0x3', amountUsdc: 1.00, timestamp: '2026-01-01T00:01:00Z' },
    ]
    const count = indexUsdcTransferBatch(db, transfers)
    expect(count).toBe(2)

    // Duplicate insert should be ignored
    const count2 = indexUsdcTransferBatch(db, transfers)
    expect(count2).toBe(0)

    const rows = db.prepare('SELECT * FROM usdc_transfers').all()
    expect(rows).toHaveLength(2)
    db.close()
  })
})

describe('refreshWalletTransferStats', () => {
  it('aggregates stats from usdc_transfers', () => {
    const db = createTestDb()
    const transfers = [
      { txHash: '0xaaa', blockNumber: 100, fromWallet: '0x1', toWallet: '0x2', amountUsdc: 0.50, timestamp: '2026-01-01T00:00:00Z' },
      { txHash: '0xbbb', blockNumber: 101, fromWallet: '0x3', toWallet: '0x1', amountUsdc: 1.00, timestamp: '2026-01-02T00:00:00Z' },
      { txHash: '0xccc', blockNumber: 102, fromWallet: '0x1', toWallet: '0x4', amountUsdc: 0.25, timestamp: '2026-01-03T00:00:00Z' },
    ]
    indexUsdcTransferBatch(db, transfers)
    refreshWalletTransferStats(db, ['0x1'])

    const stats = db.prepare('SELECT * FROM wallet_transfer_stats WHERE wallet = ?').get('0x1') as any
    expect(stats.total_tx_count).toBe(3)
    expect(stats.total_volume_out).toBeCloseTo(0.75)
    expect(stats.total_volume_in).toBeCloseTo(1.00)
    expect(stats.unique_partners).toBe(3)
    expect(stats.first_seen).toBe('2026-01-01T00:00:00Z')
    expect(stats.last_seen).toBe('2026-01-03T00:00:00Z')
    db.close()
  })
})
