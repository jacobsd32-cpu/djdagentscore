import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('production schema bootstrap', () => {
  let db: Database.Database

  beforeEach(() => {
    vi.resetModules()
    db = new Database(':memory:')
  })

  afterEach(() => {
    vi.doUnmock('../src/db/connection.js')
    db.close()
  })

  it('initializes a fresh database and creates score_outcomes with adaptive columns', async () => {
    vi.doMock('../src/db/connection.js', () => ({ db }))

    await import('../src/db/schema.js')

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scores', 'score_outcomes')")
      .all() as Array<{ name: string }>
    const scoreOutcomeColumns = db.prepare('PRAGMA table_info(score_outcomes)').all() as Array<{ name: string }>

    expect(tables.map((table) => table.name).sort()).toEqual(['score_outcomes', 'scores'])
    expect(scoreOutcomeColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'reliability_at_query',
        'viability_at_query',
        'identity_at_query',
        'capability_at_query',
        'behavior_at_query',
      ]),
    )
  })
})
