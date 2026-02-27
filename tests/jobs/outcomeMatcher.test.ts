/**
 * Integration tests for the outcome matcher job.
 *
 * The matcher cross-references paid score lookups (query_log) with
 * raw_transactions and fraud_reports to label outcomes for model validation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { runOutcomeMatcher } from '../../src/jobs/outcomeMatcher.js'
import {
  createTestFraudReport,
  createTestQueryLog,
  createTestTransfer,
  createTestWallet,
} from '../factories.js'
import { createTestDb } from '../helpers/testDb.js'
import type Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
}

function outcomeRows(db: Database.Database) {
  return db.prepare('SELECT * FROM score_outcomes ORDER BY id').all() as Array<{
    id: number
    query_id: number
    target_wallet: string
    requester_wallet: string | null
    outcome_type: string
    outcome_value: number | null
    model_version: string
  }>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('outcomeMatcher', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('records successful_tx when a transaction follows a paid lookup', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    // Paid lookup 5 days ago
    const ql = createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(5),
      target_score: 70,
      target_tier: 'Established',
    })

    // Transaction from requester to target 3 days ago
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 250,
      timestamp: daysAgo(3),
    })

    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].query_id).toBe(ql.id)
    expect(rows[0].target_wallet).toBe(target.wallet)
    expect(rows[0].requester_wallet).toBe(requester.wallet)
    expect(rows[0].outcome_type).toBe('successful_tx')
    expect(rows[0].outcome_value).toBe(250)
  })

  it('records multiple_successful_tx when several transactions follow', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(5),
    })

    // Two transactions after the lookup
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: daysAgo(3),
    })
    createTestTransfer(db, {
      from_wallet: target.wallet,
      to_wallet: requester.wallet,
      amount_usdc: 50,
      timestamp: daysAgo(2),
    })

    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome_type).toBe('multiple_successful_tx')
    expect(rows[0].outcome_value).toBe(150)
  })

  it('fraud_report overrides a successful transaction', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(5),
    })

    // Transaction happened...
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 200,
      timestamp: daysAgo(3),
    })

    // ...but a fraud report arrived afterward (fraud wins)
    createTestFraudReport(db, {
      target_wallet: target.wallet,
      created_at: daysAgo(2),
    })

    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome_type).toBe('fraud_report')
    expect(rows[0].outcome_value).toBeNull()
  })

  it('skips lookups still within observation window (no tx, not expired)', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    // Recent paid lookup with no follow-up activity
    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(1),
    })

    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(0)
  })

  it('ignores free-tier lookups', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 1,
      timestamp: daysAgo(5),
    })

    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: daysAgo(3),
    })

    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(0)
  })

  it('is idempotent — running twice does not duplicate outcomes', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(5),
    })
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 100,
      timestamp: daysAgo(3),
    })

    await runOutcomeMatcher(db)
    await runOutcomeMatcher(db)

    const rows = outcomeRows(db)
    expect(rows).toHaveLength(1)
  })

  it('only counts transactions AFTER the lookup timestamp', async () => {
    const requester = createTestWallet(db)
    const target = createTestWallet(db)

    createTestQueryLog(db, {
      requester_wallet: requester.wallet,
      target_wallet: target.wallet,
      is_free_tier: 0,
      timestamp: daysAgo(5),
    })

    // Transaction BEFORE the lookup — should not count
    createTestTransfer(db, {
      from_wallet: requester.wallet,
      to_wallet: target.wallet,
      amount_usdc: 500,
      timestamp: daysAgo(10),
    })

    await runOutcomeMatcher(db)

    // No outcome because the only tx predates the lookup,
    // and the lookup is still within the 30-day observation window
    const rows = outcomeRows(db)
    expect(rows).toHaveLength(0)
  })
})
