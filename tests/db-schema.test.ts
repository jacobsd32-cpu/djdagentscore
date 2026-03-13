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

  it('repairs legacy cluster_assignments schema before cluster upserts compile', async () => {
    db.exec(`
      CREATE TABLE cluster_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        cluster_name TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        assigned_at TEXT NOT NULL
      );

      INSERT INTO cluster_assignments (wallet, cluster_id, cluster_name, confidence, assigned_at)
      VALUES
        ('0xabc', 'cluster:older', 'organic_network', 0.31, '2026-03-12T00:00:00.000Z'),
        ('0xabc', 'cluster:newer', 'fraud_hotspot', 0.84, '2026-03-13T00:00:00.000Z');
    `)

    vi.doMock('../src/db/connection.js', () => ({ db }))

    await import('../src/db/schema.js')
    const { getClusterAssignmentByWallet, upsertClusterAssignment } = await import('../src/db/clusterQueries.js')

    const indexes = db.prepare('PRAGMA index_list(cluster_assignments)').all() as Array<{
      name: string
      unique: number
    }>
    const uniqueWalletIndex = indexes.find((index) => {
      if (index.unique !== 1) return false
      const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>
      return columns.length === 1 && columns[0]?.name === 'wallet'
    })

    expect(uniqueWalletIndex).toBeDefined()
    expect(
      db.prepare('SELECT COUNT(*) as count FROM cluster_assignments WHERE wallet = ?').get('0xabc') as {
        count: number
      },
    ).toEqual({ count: 1 })

    upsertClusterAssignment({
      wallet: '0xabc',
      cluster_id: 'cluster:patched',
      cluster_name: 'broker_hub',
      confidence: 0.93,
      assigned_at: '2026-03-14T00:00:00.000Z',
    })

    expect(getClusterAssignmentByWallet('0xabc')).toMatchObject({
      wallet: '0xabc',
      cluster_id: 'cluster:patched',
      cluster_name: 'broker_hub',
      confidence: 0.93,
      assigned_at: '2026-03-14T00:00:00.000Z',
    })
  })

  it('repairs legacy creator_stakes schema before staking queries compile', async () => {
    db.exec(`
      CREATE TABLE creator_stakes (
        id TEXT PRIMARY KEY,
        creator_wallet TEXT NOT NULL,
        agent_wallet TEXT NOT NULL,
        stake_amount REAL NOT NULL,
        stake_tx_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        staked_at TEXT NOT NULL
      );

      INSERT INTO creator_stakes (
        id,
        creator_wallet,
        agent_wallet,
        stake_amount,
        stake_tx_hash,
        status,
        staked_at
      ) VALUES (
        'stake_1',
        '0xcreator',
        '0xagent',
        25,
        '0xstakehash',
        'active',
        '2026-03-13T00:00:00.000Z'
      );
    `)

    vi.doMock('../src/db/connection.js', () => ({ db }))

    await import('../src/db/schema.js')
    const { getActiveCreatorStakeByPair } = await import('../src/db/stakingQueries.js')

    const creatorStakeColumns = db.prepare('PRAGMA table_info(creator_stakes)').all() as Array<{ name: string }>
    expect(creatorStakeColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'fee_amount',
        'fee_tx_hash',
        'score_boost',
        'return_eligible',
        'slashed_at',
        'slash_report_id',
      ]),
    )

    expect(getActiveCreatorStakeByPair('0xcreator', '0xagent')).toMatchObject({
      id: 'stake_1',
      creator_wallet: '0xcreator',
      agent_wallet: '0xagent',
      stake_amount: 25,
      fee_amount: 0,
      fee_tx_hash: '',
      status: 'active',
      score_boost: 0,
      return_eligible: 1,
      slashed_at: null,
      slash_report_id: null,
    })
  })
})
