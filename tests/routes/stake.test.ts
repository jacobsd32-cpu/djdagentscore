import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AGENT_WALLET = '0x1111111111111111111111111111111111111111'
const CREATOR_WALLET = '0x2222222222222222222222222222222222222222'
const PAY_TO_WALLET = '0x9999999999999999999999999999999999999999'
const STAKE_TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FEE_TX_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const adjustScoreByStakeBoost = vi.fn()

const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const testDb = new _Database(':memory:')
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS usdc_transfers (
      tx_hash TEXT UNIQUE NOT NULL,
      block_number INTEGER,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS raw_transactions (
      tx_hash TEXT UNIQUE NOT NULL,
      block_number INTEGER,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creator_stakes (
      id TEXT PRIMARY KEY,
      creator_wallet TEXT NOT NULL,
      agent_wallet TEXT NOT NULL,
      stake_amount REAL NOT NULL,
      fee_amount REAL NOT NULL DEFAULT 0,
      stake_tx_hash TEXT NOT NULL UNIQUE,
      fee_tx_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      score_boost INTEGER NOT NULL DEFAULT 0,
      staked_at TEXT NOT NULL,
      return_eligible INTEGER NOT NULL DEFAULT 1,
      slashed_at TEXT,
      slash_report_id TEXT
    );
    CREATE TABLE IF NOT EXISTS fraud_reports (
      id TEXT PRIMARY KEY,
      target_wallet TEXT NOT NULL,
      invalidated_at TEXT
    );
  `)
  return { testDb }
})

vi.mock('../../src/db.js', () => ({
  countFraudReportsByTarget: (wallet: string) =>
    (
      testDb
        .prepare('SELECT COUNT(*) as count FROM fraud_reports WHERE target_wallet = ? AND invalidated_at IS NULL')
        .get(wallet) as { count: number }
    ).count,
  getIndexedUsdcTransferByHash: (txHash: string) =>
    testDb
      .prepare(
        `
          SELECT tx_hash, from_wallet, to_wallet, amount_usdc, timestamp
          FROM usdc_transfers
          WHERE tx_hash = ?
          LIMIT 1
        `,
      )
      .get(txHash),
  getActiveCreatorStakeByPair: (creatorWallet: string, agentWallet: string) =>
    testDb
      .prepare(
        `
          SELECT
            id,
            creator_wallet,
            agent_wallet,
            stake_amount,
            fee_amount,
            stake_tx_hash,
            fee_tx_hash,
            status,
            score_boost,
            staked_at,
            return_eligible,
            slashed_at,
            slash_report_id
          FROM creator_stakes
          WHERE creator_wallet = ? AND agent_wallet = ? AND status = 'active'
          LIMIT 1
        `,
      )
      .get(creatorWallet, agentWallet),
  getCreatorStakeSummary: (agentWallet: string) =>
    testDb
      .prepare(
        `
            SELECT
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_stake_count,
              COALESCE(SUM(CASE WHEN status = 'active' THEN stake_amount ELSE 0 END), 0) as active_staked_amount,
              COALESCE(SUM(CASE WHEN status = 'active' THEN score_boost ELSE 0 END), 0) as active_score_boost,
              SUM(CASE WHEN status = 'slashed' THEN 1 ELSE 0 END) as slashed_stake_count,
              COALESCE(SUM(CASE WHEN status = 'slashed' THEN stake_amount ELSE 0 END), 0) as slashed_staked_amount,
              MAX(staked_at) as most_recent_stake_at
            FROM creator_stakes
            WHERE agent_wallet = ?
          `,
      )
      .get(agentWallet) ?? {
      active_stake_count: 0,
      active_staked_amount: 0,
      active_score_boost: 0,
      slashed_stake_count: 0,
      slashed_staked_amount: 0,
      most_recent_stake_at: null,
    },
  insertCreatorStake: (input: {
    id: string
    creator_wallet: string
    agent_wallet: string
    stake_amount: number
    fee_amount: number
    stake_tx_hash: string
    fee_tx_hash: string
    status: 'active'
    score_boost: number
    staked_at: string
    return_eligible: number
  }) => {
    testDb
      .prepare(
        `
          INSERT INTO creator_stakes (
            id,
            creator_wallet,
            agent_wallet,
            stake_amount,
            fee_amount,
            stake_tx_hash,
            fee_tx_hash,
            status,
            score_boost,
            staked_at,
            return_eligible
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.creator_wallet,
        input.agent_wallet,
        input.stake_amount,
        input.fee_amount,
        input.stake_tx_hash,
        input.fee_tx_hash,
        input.status,
        input.score_boost,
        input.staked_at,
        input.return_eligible,
      )
  },
  adjustScoreByStakeBoost: (...args: unknown[]) => adjustScoreByStakeBoost(...args),
}))

vi.mock('uuid', () => ({
  v4: () => 'stake-uuid-1234',
}))

import { Hono } from 'hono'
import stakeRoute from '../../src/routes/stake.js'

function makeApp() {
  const app = new Hono()
  app.route('/v1/stake', stakeRoute)
  return app
}

function seedUsdcTransfer(row: {
  tx_hash: string
  from_wallet: string
  to_wallet: string
  amount_usdc: number
  timestamp?: string
}) {
  testDb
    .prepare(
      `
        INSERT INTO usdc_transfers (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
        VALUES (?, 1, ?, ?, ?, ?)
      `,
    )
    .run(row.tx_hash, row.from_wallet, row.to_wallet, row.amount_usdc, row.timestamp ?? '2026-03-13T00:00:00Z')
}

describe('stake routes', () => {
  const originalPayTo = process.env.PAY_TO

  beforeEach(() => {
    process.env.PAY_TO = PAY_TO_WALLET
    adjustScoreByStakeBoost.mockReset()
    testDb.prepare('DELETE FROM creator_stakes').run()
    testDb.prepare('DELETE FROM usdc_transfers').run()
    testDb.prepare('DELETE FROM fraud_reports').run()
  })

  afterEach(() => {
    if (originalPayTo === undefined) {
      delete process.env.PAY_TO
    } else {
      process.env.PAY_TO = originalPayTo
    }
  })

  it('accepts a valid creator stake and returns 201', async () => {
    seedUsdcTransfer({
      tx_hash: STAKE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: AGENT_WALLET,
      amount_usdc: 100,
    })
    seedUsdcTransfer({
      tx_hash: FEE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: PAY_TO_WALLET,
      amount_usdc: 1,
    })

    const res = await makeApp().request('/v1/stake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payer-address': CREATOR_WALLET,
      },
      body: JSON.stringify({
        agent_wallet: AGENT_WALLET,
        stake_tx_hash: STAKE_TX_HASH,
        fee_tx_hash: FEE_TX_HASH,
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({
      stakeId: 'stake-uuid-1234',
      status: 'active',
      creatorWallet: CREATOR_WALLET,
      agentWallet: AGENT_WALLET,
      stakeTxHash: STAKE_TX_HASH,
      feeTxHash: FEE_TX_HASH,
      stakeAmount: 100,
      feeAmount: 1,
      scoreBoost: 2,
      activeStakeCount: 1,
      activeStakedAmount: 100,
      activeScoreBoost: 2,
    })
    expect(adjustScoreByStakeBoost).toHaveBeenCalledWith(AGENT_WALLET, 2)
  })

  it('rejects a fee transfer below the required 1 percent', async () => {
    seedUsdcTransfer({
      tx_hash: STAKE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: AGENT_WALLET,
      amount_usdc: 100,
    })
    seedUsdcTransfer({
      tx_hash: FEE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: PAY_TO_WALLET,
      amount_usdc: 0.25,
    })

    const res = await makeApp().request('/v1/stake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-payer-address': CREATOR_WALLET },
      body: JSON.stringify({
        agent_wallet: AGENT_WALLET,
        stake_tx_hash: STAKE_TX_HASH,
        fee_tx_hash: FEE_TX_HASH,
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_stake')
    expect(body.error.message).toMatch(/1% DJD protocol fee/i)
  })

  it('blocks new stakes for agents with active fraud reports', async () => {
    seedUsdcTransfer({
      tx_hash: STAKE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: AGENT_WALLET,
      amount_usdc: 100,
    })
    seedUsdcTransfer({
      tx_hash: FEE_TX_HASH,
      from_wallet: CREATOR_WALLET,
      to_wallet: PAY_TO_WALLET,
      amount_usdc: 1,
    })
    testDb
      .prepare('INSERT INTO fraud_reports (id, target_wallet, invalidated_at) VALUES (?, ?, NULL)')
      .run('rpt-1', AGENT_WALLET)

    const res = await makeApp().request('/v1/stake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-payer-address': CREATOR_WALLET },
      body: JSON.stringify({
        agent_wallet: AGENT_WALLET,
        stake_tx_hash: STAKE_TX_HASH,
        fee_tx_hash: FEE_TX_HASH,
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('stake_not_allowed')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await makeApp().request('/v1/stake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('invalid_json')
  })
})
