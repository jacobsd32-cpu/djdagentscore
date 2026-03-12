import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { queueWebhookEventMock } = vi.hoisted(() => ({
  queueWebhookEventMock: vi.fn(),
}))

vi.mock('../../src/jobs/webhookDelivery.js', () => ({
  queueWebhookEvent: (...args: unknown[]) => queueWebhookEventMock(...args),
}))

vi.mock('../../src/logger.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { runAnomalyDetector } from '../../src/jobs/anomalyDetector.js'

describe('runAnomalyDetector', () => {
  let db: any

  beforeEach(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE indexer_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE score_decay (
        wallet TEXT NOT NULL,
        composite_score INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE TABLE fraud_reports (
        target_wallet TEXT NOT NULL,
        reporter_wallet TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE wallet_snapshots (
        wallet TEXT NOT NULL,
        usdc_balance REAL NOT NULL,
        snapshot_at TEXT NOT NULL
      );
      CREATE TABLE scores (
        wallet TEXT PRIMARY KEY,
        composite_score INTEGER NOT NULL,
        tier TEXT NOT NULL,
        confidence REAL,
        sybil_flag INTEGER NOT NULL DEFAULT 0,
        calculated_at TEXT NOT NULL
      );
    `)
    queueWebhookEventMock.mockReset()
  })

  afterEach(() => {
    db.close()
  })

  it('emits anomaly webhook events and stores a scan cursor to avoid duplicates', async () => {
    const wallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const older = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    db.prepare(
      `
        INSERT INTO scores (wallet, composite_score, tier, confidence, sybil_flag, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(wallet, 62, 'Watch', 0.82, 1, recent)

    db.prepare('INSERT INTO score_decay (wallet, composite_score, recorded_at) VALUES (?, ?, ?)').run(wallet, 80, older)
    db.prepare('INSERT INTO score_decay (wallet, composite_score, recorded_at) VALUES (?, ?, ?)').run(
      wallet,
      62,
      recent,
    )

    db.prepare('INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)').run(
      wallet,
      1000,
      older,
    )
    db.prepare('INSERT INTO wallet_snapshots (wallet, usdc_balance, snapshot_at) VALUES (?, ?, ?)').run(
      wallet,
      300,
      recent,
    )

    db.prepare(
      'INSERT INTO fraud_reports (target_wallet, reporter_wallet, reason, created_at) VALUES (?, ?, ?, ?)',
    ).run(wallet, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'payment_fraud', recent)

    await runAnomalyDetector(db)

    expect(queueWebhookEventMock).toHaveBeenCalledTimes(3)
    expect(queueWebhookEventMock).toHaveBeenCalledWith(
      'anomaly.score_drop',
      expect.objectContaining({
        wallet,
        anomalyType: 'score_drop',
        previousScore: 80,
        currentScore: 62,
        scoreDelta: -18,
        tier: 'Watch',
      }),
    )
    expect(queueWebhookEventMock).toHaveBeenCalledWith(
      'anomaly.balance_freefall',
      expect.objectContaining({
        wallet,
        anomalyType: 'balance_freefall',
        previousBalance: 1000,
        currentBalance: 300,
      }),
    )
    expect(queueWebhookEventMock).toHaveBeenCalledWith(
      'anomaly.sybil_flagged',
      expect.objectContaining({
        wallet,
        anomalyType: 'sybil_flagged',
        score: 62,
        tier: 'Watch',
      }),
    )

    const cursor = db.prepare('SELECT value FROM indexer_state WHERE key = ?').get('anomaly_detector_last_scan_at') as
      | { value: string }
      | undefined
    expect(cursor?.value).toBeTruthy()

    queueWebhookEventMock.mockReset()
    await runAnomalyDetector(db)
    expect(queueWebhookEventMock).not.toHaveBeenCalled()
  })
})
