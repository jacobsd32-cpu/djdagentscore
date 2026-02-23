import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'
import {
  generateCalibrationReport,
  POSITIVE_OUTCOMES,
  NEGATIVE_OUTCOMES,
} from '../src/scoring/calibrationReport.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Insert a score_outcomes row with the fields the calibration report cares about. */
function seedOutcome(
  db: ReturnType<typeof createTestDb>,
  opts: {
    wallet: string
    outcomeType: string
    scoreAtQuery: number
    tierAtQuery: string
    outcomeAt?: string
  },
) {
  const outcomeAt = opts.outcomeAt ?? new Date().toISOString()
  db.prepare(
    `INSERT INTO score_outcomes
       (target_wallet, outcome_type, score_at_query, tier_at_query, outcome_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(opts.wallet, opts.outcomeType, opts.scoreAtQuery, opts.tierAtQuery, outcomeAt)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('calibrationReport — outcome classification', () => {
  it('classifies successful_tx and multiple_successful_tx as positive', () => {
    expect(POSITIVE_OUTCOMES.has('successful_tx')).toBe(true)
    expect(POSITIVE_OUTCOMES.has('multiple_successful_tx')).toBe(true)
    expect(POSITIVE_OUTCOMES.has('fraud_report')).toBe(false)
    expect(POSITIVE_OUTCOMES.has('no_activity')).toBe(false)
  })

  it('classifies fraud_report as negative', () => {
    expect(NEGATIVE_OUTCOMES.has('fraud_report')).toBe(true)
    expect(NEGATIVE_OUTCOMES.has('successful_tx')).toBe(false)
    expect(NEGATIVE_OUTCOMES.has('no_activity')).toBe(false)
  })
})

describe('generateCalibrationReport', () => {
  it('returns empty report when no outcomes exist', () => {
    const db = createTestDb()
    const report = generateCalibrationReport(db, '2.0.0')

    expect(report.total_scored).toBe(0)
    expect(report.model_version).toBe('2.0.0')
    expect(JSON.parse(report.avg_score_by_outcome)).toEqual({})
    expect(JSON.parse(report.tier_accuracy)).toEqual({})
    expect(JSON.parse(report.recommendations)).toEqual([])

    db.close()
  })

  it('computes avg score by outcome type using score_at_query', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Two successful wallets with different scores
    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 80, tierAtQuery: 'Trusted', outcomeAt: now })
    seedOutcome(db, { wallet: '0x2', outcomeType: 'multiple_successful_tx', scoreAtQuery: 90, tierAtQuery: 'Elite', outcomeAt: now })
    // One fraud wallet
    seedOutcome(db, { wallet: '0x3', outcomeType: 'fraud_report', scoreAtQuery: 30, tierAtQuery: 'Emerging', outcomeAt: now })
    // One inactive wallet
    seedOutcome(db, { wallet: '0x4', outcomeType: 'no_activity', scoreAtQuery: 50, tierAtQuery: 'Established', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const avgScores = JSON.parse(report.avg_score_by_outcome)

    expect(report.total_scored).toBe(4)
    expect(avgScores.successful_tx).toEqual({ avgScore: 80, count: 1 })
    expect(avgScores.multiple_successful_tx).toEqual({ avgScore: 90, count: 1 })
    expect(avgScores.fraud_report).toEqual({ avgScore: 30, count: 1 })
    expect(avgScores.no_activity).toEqual({ avgScore: 50, count: 1 })

    db.close()
  })

  it('computes tier accuracy with positive/negative rates', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Elite: 2 positive, 0 negative → 100% positive rate
    seedOutcome(db, { wallet: '0xA1', outcomeType: 'successful_tx', scoreAtQuery: 90, tierAtQuery: 'Elite', outcomeAt: now })
    seedOutcome(db, { wallet: '0xA2', outcomeType: 'multiple_successful_tx', scoreAtQuery: 95, tierAtQuery: 'Elite', outcomeAt: now })

    // Trusted: 1 positive, 1 negative → 50% positive rate
    seedOutcome(db, { wallet: '0xB1', outcomeType: 'successful_tx', scoreAtQuery: 75, tierAtQuery: 'Trusted', outcomeAt: now })
    seedOutcome(db, { wallet: '0xB2', outcomeType: 'fraud_report', scoreAtQuery: 70, tierAtQuery: 'Trusted', outcomeAt: now })

    // Emerging: 0 positive, 1 negative → 0% positive rate
    seedOutcome(db, { wallet: '0xC1', outcomeType: 'fraud_report', scoreAtQuery: 25, tierAtQuery: 'Emerging', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const tiers = JSON.parse(report.tier_accuracy)

    // Elite: 2 total, 2 positive, 0 negative
    expect(tiers.Elite.total).toBe(2)
    expect(tiers.Elite.positive).toBe(2)
    expect(tiers.Elite.negative).toBe(0)
    expect(tiers.Elite.positiveRate).toBe(1) // 100%

    // Trusted: 2 total, 1 positive, 1 negative
    expect(tiers.Trusted.total).toBe(2)
    expect(tiers.Trusted.positive).toBe(1)
    expect(tiers.Trusted.negative).toBe(1)
    expect(tiers.Trusted.positiveRate).toBe(0.5) // 50%

    // Emerging: 1 total, 0 positive, 1 negative
    expect(tiers.Emerging.total).toBe(1)
    expect(tiers.Emerging.positive).toBe(0)
    expect(tiers.Emerging.negative).toBe(1)
    expect(tiers.Emerging.positiveRate).toBe(0) // 0%

    db.close()
  })

  it('detects healthy score-outcome separation', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Positive wallets avg score = 80
    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 80, tierAtQuery: 'Trusted', outcomeAt: now })

    // Negative wallets avg score = 20 → separation = 60 (healthy)
    seedOutcome(db, { wallet: '0x2', outcomeType: 'fraud_report', scoreAtQuery: 20, tierAtQuery: 'Unverified', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    const separationRec = recs.find(r => r.includes('separation'))
    expect(separationRec).toBeDefined()
    expect(separationRec).toContain('healthy')
    expect(separationRec).toContain('60 points')

    db.close()
  })

  it('flags weak score-outcome separation', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Positive avg = 55, Negative avg = 50 → separation = 5 (weak!)
    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 55, tierAtQuery: 'Established', outcomeAt: now })
    seedOutcome(db, { wallet: '0x2', outcomeType: 'fraud_report', scoreAtQuery: 50, tierAtQuery: 'Established', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    const weakRec = recs.find(r => r.includes('Weak score-outcome separation'))
    expect(weakRec).toBeDefined()
    expect(weakRec).toContain('5 points')

    db.close()
  })

  it('detects monotonicity violations', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Elite: 1 positive out of 2 → 50%
    seedOutcome(db, { wallet: '0xA1', outcomeType: 'successful_tx', scoreAtQuery: 90, tierAtQuery: 'Elite', outcomeAt: now })
    seedOutcome(db, { wallet: '0xA2', outcomeType: 'fraud_report', scoreAtQuery: 85, tierAtQuery: 'Elite', outcomeAt: now })

    // Trusted: 2 positive out of 2 → 100% — violates monotonicity (outperforms Elite!)
    seedOutcome(db, { wallet: '0xB1', outcomeType: 'successful_tx', scoreAtQuery: 75, tierAtQuery: 'Trusted', outcomeAt: now })
    seedOutcome(db, { wallet: '0xB2', outcomeType: 'multiple_successful_tx', scoreAtQuery: 70, tierAtQuery: 'Trusted', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    const monoRec = recs.find(r => r.includes('Monotonicity violation'))
    expect(monoRec).toBeDefined()
    expect(monoRec).toContain('Trusted')

    db.close()
  })

  it('flags fraud wallets with high average scores', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Fraud wallet with score 65 (> 50 threshold)
    seedOutcome(db, { wallet: '0x1', outcomeType: 'fraud_report', scoreAtQuery: 65, tierAtQuery: 'Established', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    const fraudRec = recs.find(r => r.includes('Fraudulent wallets'))
    expect(fraudRec).toBeDefined()
    expect(fraudRec).toContain('Integrity multiplier')

    db.close()
  })

  it('flags inactive wallets with high average scores', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // Inactive wallet with score 70 (> 60 threshold)
    seedOutcome(db, { wallet: '0x1', outcomeType: 'no_activity', scoreAtQuery: 70, tierAtQuery: 'Trusted', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    const inactiveRec = recs.find(r => r.includes('Inactive wallets'))
    expect(inactiveRec).toBeDefined()
    expect(inactiveRec).toContain('recency decay')

    db.close()
  })

  it('persists the report to calibration_reports table', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 80, tierAtQuery: 'Trusted', outcomeAt: now })

    generateCalibrationReport(db, '2.0.0')

    const row = db.prepare('SELECT * FROM calibration_reports ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.model_version).toBe('2.0.0')
    expect(row.total_scored).toBe(1)

    db.close()
  })

  it('ignores outcomes older than 30 days', () => {
    const db = createTestDb()

    // Outcome from 45 days ago — should be excluded
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 80, tierAtQuery: 'Trusted', outcomeAt: oldDate })

    // Recent outcome — should be included
    const now = new Date().toISOString()
    seedOutcome(db, { wallet: '0x2', outcomeType: 'fraud_report', scoreAtQuery: 30, tierAtQuery: 'Emerging', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    expect(report.total_scored).toBe(1) // Only the recent one

    const avgScores = JSON.parse(report.avg_score_by_outcome)
    expect(avgScores.successful_tx).toBeUndefined() // Old one excluded
    expect(avgScores.fraud_report).toBeDefined()

    db.close()
  })

  it('uses weighted average for score-outcome separation with multiple rows', () => {
    const db = createTestDb()
    const now = new Date().toISOString()

    // 3 successful_tx wallets: scores 60, 80, 100 → avg = 80
    seedOutcome(db, { wallet: '0x1', outcomeType: 'successful_tx', scoreAtQuery: 60, tierAtQuery: 'Established', outcomeAt: now })
    seedOutcome(db, { wallet: '0x2', outcomeType: 'successful_tx', scoreAtQuery: 80, tierAtQuery: 'Trusted', outcomeAt: now })
    seedOutcome(db, { wallet: '0x3', outcomeType: 'successful_tx', scoreAtQuery: 100, tierAtQuery: 'Elite', outcomeAt: now })

    // 1 fraud wallet: score 20
    seedOutcome(db, { wallet: '0x4', outcomeType: 'fraud_report', scoreAtQuery: 20, tierAtQuery: 'Unverified', outcomeAt: now })

    const report = generateCalibrationReport(db, '2.0.0')
    const recs = JSON.parse(report.recommendations) as string[]

    // The AVG is computed per outcome_type by SQL, then weightedAvg combines across positive types
    // successful_tx: avg = (60+80+100)/3 = 80, count = 3
    // fraud_report: avg = 20, count = 1
    // Separation = 80 - 20 = 60
    const sepRec = recs.find(r => r.includes('separation'))
    expect(sepRec).toContain('60 points')

    db.close()
  })
})
