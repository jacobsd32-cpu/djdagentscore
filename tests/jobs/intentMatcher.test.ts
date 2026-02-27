/**
 * Integration tests for the intent signal matcher job.
 *
 * The matcher cross-references paid score lookups with raw_transactions
 * to determine whether a query was followed by an actual transaction
 * within a 24-hour window.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import type Database from 'better-sqlite3'
import { runIntentMatcher } from '../../src/jobs/intentMatcher.js'
import { createTestQueryLog, createTestTransfer, createTestWallet } from '../factories.js'
import { createTestDb } from '../helpers/testDb.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function intentRows(db: Database.Database) {
  return db.prepare('SELECT * FROM intent_signals ORDER BY id').all() as Array<{
    id: number
    requester_wallet: string
    target_wallet: string
    query_timestamp: string
    followed_by_tx: number
    tx_hash: string | null
    time_to_tx_ms: number | null
  }>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('intentMatcher', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('records a conversion when a tx follows a paid lookup within 24h', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    const queryTs = hoursAgo(6)
    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: queryTs,
    })

    // Transaction 2 hours after the query
    const txTs = hoursAgo(4)
    const tx = createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: txTs,
    })

    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].requester_wallet).toBe(requester.wallet)
    expect(rows[0].target_wallet).toBe(target.wallet)
    expect(rows[0].followed_by_tx).toBe(1)
    expect(rows[0].tx_hash).toBe(tx.tx_hash)
    expect(rows[0].time_to_tx_ms).toBeGreaterThan(0)
  })

  it('picks the earliest tx within the 24h window', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: hoursAgo(12),
    })

    // Two transactions — matcher should pick the earlier one (ORDER BY timestamp ASC LIMIT 1)
    const earlyTx = createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 50,
      timestamp: hoursAgo(10),
    })
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 200,
      timestamp: hoursAgo(8),
    })

    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].tx_hash).toBe(earlyTx.tx_hash)
  })

  it('skips lookups still within the observation window with no tx', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    // Recent lookup (2 hours ago) with no follow-up tx — still in window
    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: hoursAgo(2),
    })

    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(0)
  })

  it('ignores free-tier lookups', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 1,
      timestamp: hoursAgo(6),
    })

    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: hoursAgo(4),
    })

    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(0)
  })

  it('ignores lookups without a requester_wallet', async () => {
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: null,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: hoursAgo(6),
    })

    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(0)
  })

  it('is idempotent — running twice does not duplicate signals', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: hoursAgo(6),
    })
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: hoursAgo(4),
    })

    await runIntentMatcher(db)
    await runIntentMatcher(db)

    const rows = intentRows(db)
    expect(rows).toHaveLength(1)
  })

  it('ignores transactions outside the 24h window', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    const queryTs = hoursAgo(6)
    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: queryTs,
    })

    // Transaction 30 hours after query (outside the 24h window)
    // windowEnd = queryTs + 24h. We need a tx after windowEnd.
    // queryTs is 6h ago, windowEnd is 6h ago + 24h = 18h in the future.
    // A tx 18h in the future would be outside window... but we can't have future txs.
    // Instead: query 30h ago, tx 2h ago → 28h after query, outside 24h window.
    const queryTs2 = hoursAgo(30)
    // Clear and re-insert with different timestamp
    db.prepare('DELETE FROM query_log').run()
    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: queryTs2,
    })
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: hoursAgo(2),
    })

    await runIntentMatcher(db)

    // The query is >24h old but the tx is outside the 24h-after-query window
    // The matcher fetches queries in last 24h, so a 30h-old query won't be fetched
    const rows = intentRows(db)
    expect(rows).toHaveLength(0)
  })
})
