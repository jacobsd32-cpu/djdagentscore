import { describe, expect, it } from 'vitest'
import {
  createTestFraudReport,
  createTestMetrics,
  createTestQueryLog,
  createTestScore,
  createTestSnapshot,
  createTestTransfer,
  createTestWallet,
} from './factories.js'
import { createTestDb } from './helpers/testDb.js'

describe('test factories', () => {
  it('inserts and returns rows with defaults', () => {
    const db = createTestDb()

    const wallet = createTestWallet(db)
    expect(wallet.total_tx_count).toBe(10)
    expect(db.prepare('SELECT COUNT(*) as c FROM wallet_index').get()).toEqual({ c: 1 })

    const tx = createTestTransfer(db, { from_wallet: wallet.wallet })
    expect(tx.from_wallet).toBe(wallet.wallet)
    expect(db.prepare('SELECT COUNT(*) as c FROM raw_transactions').get()).toEqual({ c: 1 })

    const score = createTestScore(db, { wallet: wallet.wallet })
    expect(score.tier).toBe('Established')
    expect(db.prepare('SELECT tier FROM scores WHERE wallet = ?').get(wallet.wallet)).toEqual({ tier: 'Established' })

    const ql = createTestQueryLog(db)
    expect(ql.id).toBeGreaterThan(0)
    expect(ql.is_free_tier).toBe(0)

    const fraud = createTestFraudReport(db)
    expect(fraud.reason).toBe('Suspected sybil')

    const snap = createTestSnapshot(db, { wallet: wallet.wallet, usdc_balance: 500 })
    expect(snap.usdc_balance).toBe(500)

    const metrics = createTestMetrics(db, { wallet: wallet.wallet })
    expect(metrics.balance_trend_7d).toBe('stable')
  })

  it('overrides work correctly', () => {
    const db = createTestDb()
    const w = createTestWallet(db, { total_tx_count: 99, total_volume_in: 9999 })
    expect(w.total_tx_count).toBe(99)
    expect(w.total_volume_in).toBe(9999)

    const _score = createTestScore(db, { wallet: w.wallet, composite_score: 95, tier: 'Elite' })
    const row = db.prepare('SELECT composite_score, tier FROM scores WHERE wallet = ?').get(w.wallet) as {
      composite_score: number
      tier: string
    }
    expect(row.composite_score).toBe(95)
    expect(row.tier).toBe('Elite')
  })
})
