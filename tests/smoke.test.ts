import { describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/testDb.js'

describe('test infrastructure', () => {
  it('creates an in-memory database with expected tables', () => {
    const db = createTestDb()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('raw_transactions')
    expect(names).toContain('wallet_index')
    expect(names).toContain('scores')
    expect(names).toContain('fraud_patterns')
    expect(names).toContain('cluster_assignments')
    expect(names).toContain('mutual_ratings')
    expect(names).toContain('creator_stakes')
    db.close()
  })
})
