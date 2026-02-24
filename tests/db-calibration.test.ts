import { describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/testDb.js'

describe('calibration_reports table', () => {
  it('exists with correct columns', () => {
    const db = createTestDb()
    const info = db.prepare('PRAGMA table_info(calibration_reports)').all() as { name: string }[]
    const cols = info.map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'generated_at',
        'period_start',
        'period_end',
        'total_scored',
        'avg_score_by_outcome',
        'tier_accuracy',
        'recommendations',
        'model_version',
      ]),
    )
    db.close()
  })
})
