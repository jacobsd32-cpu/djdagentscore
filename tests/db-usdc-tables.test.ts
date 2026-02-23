import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'

describe('USDC transfer tables', () => {
  it('usdc_transfers table exists with correct columns', () => {
    const db = createTestDb()
    const info = db.prepare('PRAGMA table_info(usdc_transfers)').all() as { name: string }[]
    const cols = info.map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining([
        'tx_hash', 'block_number', 'from_wallet', 'to_wallet', 'amount_usdc', 'timestamp',
      ]),
    )
    db.close()
  })

  it('wallet_transfer_stats table exists with correct columns', () => {
    const db = createTestDb()
    const info = db.prepare('PRAGMA table_info(wallet_transfer_stats)').all() as { name: string }[]
    const cols = info.map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining([
        'wallet', 'total_tx_count', 'total_volume_in', 'total_volume_out',
        'unique_partners', 'first_seen', 'last_seen', 'updated_at',
      ]),
    )
    db.close()
  })
})
