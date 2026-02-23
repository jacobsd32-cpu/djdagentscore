import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'
import { generateCalibrationReport } from '../src/scoring/calibrationReport.js'

describe('generateCalibrationReport', () => {
  it('generates a report from scored wallets with outcomes', () => {
    const db = createTestDb()

    // Insert scored wallets — testDb uses scored_at/updated_at columns
    const insertScore = db.prepare(`
      INSERT INTO scores (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score, tier, confidence, model_version, scored_at, updated_at)
      VALUES (?, ?, 70, 60, 50, 40, ?, 0.8, '2.0.0', ?, ?)
    `)
    const insertOutcome = db.prepare(`
      INSERT INTO score_outcomes (wallet, outcome_label, labeled_at, score_at_label)
      VALUES (?, ?, ?, ?)
    `)

    const now = new Date().toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    insertScore.run('0x1', 80, 'Trusted', thirtyDaysAgo, thirtyDaysAgo)
    insertOutcome.run('0x1', 'reliable_transactor', now, 80)

    insertScore.run('0x2', 45, 'Emerging', thirtyDaysAgo, thirtyDaysAgo)
    insertOutcome.run('0x2', 'dormant', now, 45)

    insertScore.run('0x3', 72, 'Trusted', thirtyDaysAgo, thirtyDaysAgo)
    insertOutcome.run('0x3', 'reliable_transactor', now, 72)

    const report = generateCalibrationReport(db, '2.0.0')
    expect(report.total_scored).toBe(3)
    expect(report.avg_score_by_outcome).toBeDefined()

    const avgScores = JSON.parse(report.avg_score_by_outcome)
    expect(avgScores.reliable_transactor).toBe(76) // (80+72)/2
    expect(avgScores.dormant).toBe(45)

    db.close()
  })

  it('returns empty report when no outcomes exist', () => {
    const db = createTestDb()
    const report = generateCalibrationReport(db, '2.0.0')
    expect(report.total_scored).toBe(0)
    db.close()
  })
})
