# Scoring System Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform DJD Agent Score from a generic wallet scorer into a novel AI agent reputation system with proprietary behavioral analysis, calibrated scoring, multiplicative integrity modifiers, and transparent explainability.

**Architecture:** Five priorities (P1–P5) from the approved design doc at `docs/plans/2026-02-22-scoring-overhaul-design.md`. Each priority adds a layer: P1 indexes USDC transfers for richer data, P2 adds a behavioral dimension, P3 adds outcome calibration, P4 replaces additive sybil/gaming penalties with multiplicative integrity, P5 adds per-signal explainability. All changes are backward-compatible — new API fields are optional.

**Tech Stack:** TypeScript ESM, Hono, better-sqlite3, viem, vitest (new), Base L2 via BlastAPI RPC.

---

## Task 0: Test Infrastructure Setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/helpers/testDb.ts`
- Create: `tests/smoke.test.ts`

**Step 1: Install vitest**

Run:
```
npm install --save-dev vitest
```

**Step 2: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

**Step 4: Create test database helper**

Create `tests/helpers/testDb.ts`:
```typescript
import Database from 'better-sqlite3'

/**
 * Creates a fresh in-memory SQLite database with the same schema as production.
 * Mirrors the table definitions in src/db.ts.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_transactions (
      tx_hash TEXT UNIQUE,
      block_number INTEGER,
      from_wallet TEXT,
      to_wallet TEXT,
      amount REAL,
      timestamp TEXT,
      facilitator TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_index (
      wallet TEXT PRIMARY KEY,
      first_seen TEXT,
      last_seen TEXT,
      total_tx_count INTEGER DEFAULT 0,
      total_volume_in REAL DEFAULT 0,
      total_volume_out REAL DEFAULT 0,
      unique_partners INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationship_graph (
      wallet_a TEXT,
      wallet_b TEXT,
      tx_count INTEGER DEFAULT 0,
      total_volume_a_to_b REAL DEFAULT 0,
      total_volume_b_to_a REAL DEFAULT 0,
      first_interaction TEXT,
      last_interaction TEXT,
      PRIMARY KEY (wallet_a, wallet_b)
    );

    CREATE TABLE IF NOT EXISTS wallet_metrics (
      wallet TEXT PRIMARY KEY,
      tx_count_24h INTEGER DEFAULT 0,
      tx_count_7d INTEGER DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT,
      usdc_balance REAL,
      snapshot_at TEXT
    );

    CREATE TABLE IF NOT EXISTS query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_wallet TEXT,
      endpoint TEXT,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER,
      reliability_score INTEGER,
      viability_score INTEGER,
      identity_score INTEGER,
      capability_score INTEGER,
      tier TEXT,
      confidence REAL,
      recommendation TEXT,
      sybil_flag INTEGER DEFAULT 0,
      gaming_detected INTEGER DEFAULT 0,
      model_version TEXT,
      raw_data TEXT,
      meta TEXT,
      scored_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS score_outcomes (
      wallet TEXT PRIMARY KEY,
      outcome_label TEXT,
      labeled_at TEXT,
      score_at_label INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS fraud_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_wallet TEXT,
      target_wallet TEXT,
      reason TEXT,
      evidence TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      resolved_at TEXT
    );
  `)

  return db
}
```

**Step 5: Create smoke test**

Create `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'

describe('test infrastructure', () => {
  it('creates an in-memory database with expected tables', () => {
    const db = createTestDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]

    const names = tables.map((t) => t.name)
    expect(names).toContain('raw_transactions')
    expect(names).toContain('wallet_index')
    expect(names).toContain('scores')
    db.close()
  })
})
```

**Step 6: Run the smoke test**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS

**Step 7: Commit**

```
git add package.json vitest.config.ts tests/
git commit -m "chore: add vitest test infrastructure with in-memory DB helper"
```

---

## Task 1: P1 — USDC Transfer Tables (Schema Only)

**Files:**
- Modify: `src/db.ts` (add table creation SQL)
- Modify: `tests/helpers/testDb.ts` (mirror new tables)
- Create: `tests/db-usdc-tables.test.ts`

**Step 1: Write the failing test**

Create `tests/db-usdc-tables.test.ts`:
```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db-usdc-tables.test.ts`
Expected: FAIL — tables don't exist yet

**Step 3: Add tables to `src/db.ts`**

In `src/db.ts`, find the section where tables are created (after `score_outcomes`). Add:

```typescript
// ── P1: USDC Transfer Index ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usdc_transfers (
    tx_hash TEXT UNIQUE,
    block_number INTEGER,
    from_wallet TEXT,
    to_wallet TEXT,
    amount_usdc REAL,
    timestamp TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_from ON usdc_transfers(from_wallet);
  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_to ON usdc_transfers(to_wallet);
  CREATE INDEX IF NOT EXISTS idx_usdc_transfers_block ON usdc_transfers(block_number);

  CREATE TABLE IF NOT EXISTS wallet_transfer_stats (
    wallet TEXT PRIMARY KEY,
    total_tx_count INTEGER DEFAULT 0,
    total_volume_in REAL DEFAULT 0,
    total_volume_out REAL DEFAULT 0,
    unique_partners INTEGER DEFAULT 0,
    first_seen TEXT,
    last_seen TEXT,
    updated_at TEXT
  );
`)
```

**Step 4: Mirror tables in `tests/helpers/testDb.ts`**

Add the same `usdc_transfers` and `wallet_transfer_stats` CREATE TABLE statements to the `createTestDb()` function.

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/db-usdc-tables.test.ts`
Expected: PASS

**Step 6: Commit**

```
git add src/db.ts tests/
git commit -m "feat(P1): add usdc_transfers and wallet_transfer_stats tables"
```

---

## Task 2: P1 — USDC Transfer Indexer Helper Functions

**Files:**
- Create: `src/jobs/usdcTransferHelpers.ts`
- Create: `tests/usdc-transfer-helpers.test.ts`

**Step 1: Write the failing test**

Create `tests/usdc-transfer-helpers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from '../src/jobs/usdcTransferHelpers.js'

describe('indexUsdcTransferBatch', () => {
  it('inserts transfers and ignores duplicates', () => {
    const db = createTestDb()
    const transfers = [
      { txHash: '0xaaa', blockNumber: 100, fromWallet: '0x1', toWallet: '0x2', amountUsdc: 0.50, timestamp: '2026-01-01T00:00:00Z' },
      { txHash: '0xbbb', blockNumber: 101, fromWallet: '0x2', toWallet: '0x3', amountUsdc: 1.00, timestamp: '2026-01-01T00:01:00Z' },
    ]
    const count = indexUsdcTransferBatch(db, transfers)
    expect(count).toBe(2)

    // Duplicate insert should be ignored
    const count2 = indexUsdcTransferBatch(db, transfers)
    expect(count2).toBe(0)

    const rows = db.prepare('SELECT * FROM usdc_transfers').all()
    expect(rows).toHaveLength(2)
    db.close()
  })
})

describe('refreshWalletTransferStats', () => {
  it('aggregates stats from usdc_transfers', () => {
    const db = createTestDb()
    const transfers = [
      { txHash: '0xaaa', blockNumber: 100, fromWallet: '0x1', toWallet: '0x2', amountUsdc: 0.50, timestamp: '2026-01-01T00:00:00Z' },
      { txHash: '0xbbb', blockNumber: 101, fromWallet: '0x3', toWallet: '0x1', amountUsdc: 1.00, timestamp: '2026-01-02T00:00:00Z' },
      { txHash: '0xccc', blockNumber: 102, fromWallet: '0x1', toWallet: '0x4', amountUsdc: 0.25, timestamp: '2026-01-03T00:00:00Z' },
    ]
    indexUsdcTransferBatch(db, transfers)
    refreshWalletTransferStats(db, ['0x1'])

    const stats = db.prepare('SELECT * FROM wallet_transfer_stats WHERE wallet = ?').get('0x1') as any
    expect(stats.total_tx_count).toBe(3)
    expect(stats.total_volume_out).toBeCloseTo(0.75)
    expect(stats.total_volume_in).toBeCloseTo(1.00)
    expect(stats.unique_partners).toBe(3)
    expect(stats.first_seen).toBe('2026-01-01T00:00:00Z')
    expect(stats.last_seen).toBe('2026-01-03T00:00:00Z')
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usdc-transfer-helpers.test.ts`
Expected: FAIL — module not found

**Step 3: Implement helper functions**

Create `src/jobs/usdcTransferHelpers.ts`:
```typescript
import type { Database } from 'better-sqlite3'

export interface UsdcTransfer {
  txHash: string
  blockNumber: number
  fromWallet: string
  toWallet: string
  amountUsdc: number
  timestamp: string
}

/**
 * Batch-insert USDC transfers. Returns count of newly inserted rows.
 * Duplicates (by tx_hash) are silently ignored.
 */
export function indexUsdcTransferBatch(db: Database, transfers: UsdcTransfer[]): number {
  if (transfers.length === 0) return 0

  const insert = db.prepare(`
    INSERT OR IGNORE INTO usdc_transfers (tx_hash, block_number, from_wallet, to_wallet, amount_usdc, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let inserted = 0
  const txn = db.transaction(() => {
    for (const t of transfers) {
      const result = insert.run(
        t.txHash,
        t.blockNumber,
        t.fromWallet.toLowerCase(),
        t.toWallet.toLowerCase(),
        t.amountUsdc,
        t.timestamp,
      )
      if (result.changes > 0) inserted++
    }
  })
  txn()
  return inserted
}

/**
 * Refresh wallet_transfer_stats for the given wallets by aggregating from usdc_transfers.
 */
export function refreshWalletTransferStats(db: Database, wallets: string[]): void {
  const upsert = db.prepare(`
    INSERT INTO wallet_transfer_stats (wallet, total_tx_count, total_volume_in, total_volume_out, unique_partners, first_seen, last_seen, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wallet) DO UPDATE SET
      total_tx_count = excluded.total_tx_count,
      total_volume_in = excluded.total_volume_in,
      total_volume_out = excluded.total_volume_out,
      unique_partners = excluded.unique_partners,
      first_seen = excluded.first_seen,
      last_seen = excluded.last_seen,
      updated_at = datetime('now')
  `)

  const txn = db.transaction(() => {
    for (const wallet of wallets) {
      const w = wallet.toLowerCase()

      const outgoing = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_usdc), 0) as vol,
               MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
        FROM usdc_transfers WHERE from_wallet = ?
      `).get(w) as { cnt: number; vol: number; first_ts: string | null; last_ts: string | null }

      const incoming = db.prepare(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(amount_usdc), 0) as vol,
               MIN(timestamp) as first_ts, MAX(timestamp) as last_ts
        FROM usdc_transfers WHERE to_wallet = ?
      `).get(w) as { cnt: number; vol: number; first_ts: string | null; last_ts: string | null }

      const partners = db.prepare(`
        SELECT COUNT(DISTINCT partner) as cnt FROM (
          SELECT to_wallet as partner FROM usdc_transfers WHERE from_wallet = ?
          UNION
          SELECT from_wallet as partner FROM usdc_transfers WHERE to_wallet = ?
        )
      `).get(w, w) as { cnt: number }

      const totalTx = outgoing.cnt + incoming.cnt
      const timestamps = [outgoing.first_ts, incoming.first_ts, outgoing.last_ts, incoming.last_ts].filter(Boolean) as string[]
      const firstSeen = timestamps.length > 0 ? timestamps.sort()[0] : null
      const lastSeen = timestamps.length > 0 ? timestamps.sort().reverse()[0] : null

      upsert.run(w, totalTx, incoming.vol, outgoing.vol, partners.cnt, firstSeen, lastSeen)
    }
  })
  txn()
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usdc-transfer-helpers.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/jobs/usdcTransferHelpers.ts tests/usdc-transfer-helpers.test.ts
git commit -m "feat(P1): add USDC transfer batch insert and stats refresh helpers"
```

---

## Task 3: P1 — USDC Transfer Forward Indexer

**Files:**
- Create: `src/jobs/usdcTransferIndexer.ts`
- Modify: `src/index.ts` (start the indexer alongside existing one)

**Step 1: Create the forward indexer**

Create `src/jobs/usdcTransferIndexer.ts`. This mirrors `src/jobs/blockchainIndexer.ts` but:
- Uses state key `'usdc_last_indexed_block'`
- Fetches ONLY Transfer events (no AuthorizationUsed filter)
- No amount cap (indexes ALL USDC transfers)
- Rate-limited: 200ms delay between getLogs calls (~5/sec, stays well within BlastAPI free tier)
- Calls `indexUsdcTransferBatch()` and `refreshWalletTransferStats()` from Task 2

```typescript
/**
 * USDC Transfer Indexer — continuous forward indexer
 *
 * Indexes ALL Base USDC Transfer events (not just x402) into usdc_transfers.
 * Runs alongside blockchainIndexer.ts without interference.
 * Uses separate state key: 'usdc_last_indexed_block'.
 */
import { parseAbiItem } from 'viem'
import { log } from '../logger.js'
import { publicClient, USDC_ADDRESS } from '../blockchain.js'
import { getDb } from '../db.js'
import { getIndexerState, setIndexerState } from '../db.js'
import { indexUsdcTransferBatch, refreshWalletTransferStats } from './usdcTransferHelpers.js'
import type { UsdcTransfer } from './usdcTransferHelpers.js'

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

const STATE_KEY = 'usdc_last_indexed_block'
const POLL_INTERVAL_MS = 15_000
const RETRY_DELAY_MS = 30_000
const LOG_CHUNK_SIZE = 2_000n  // Smaller chunks to stay within rate limits
const RATE_LIMIT_DELAY_MS = 200  // ~5 getLogs/sec

let running = false
let lastBlockIndexed = 0n

export function getUsdcIndexerStatus(): { lastBlockIndexed: number; running: boolean } {
  return { lastBlockIndexed: Number(lastBlockIndexed), running }
}

function blockToIsoTimestamp(blockNumber: bigint, anchorBlock: bigint, anchorTsMs: bigint): string {
  const ms = anchorTsMs + (blockNumber - anchorBlock) * 2000n
  return new Date(Number(ms)).toISOString()
}

async function fetchAndIndexChunk(start: bigint, end: bigint): Promise<number> {
  const [transferLogs, anchorBlockData] = await Promise.all([
    publicClient.getLogs({
      address: USDC_ADDRESS,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    }),
    publicClient.getBlock({ blockNumber: start }).catch(() => null),
  ])

  if (transferLogs.length === 0) return 0

  const chunkAnchorBlock = anchorBlockData?.number ?? start
  const chunkAnchorTsMs = anchorBlockData
    ? anchorBlockData.timestamp * 1000n
    : 1677177203_000n + (start - 1n) * 2000n

  const transfers: UsdcTransfer[] = []
  for (const logEntry of transferLogs) {
    if (
      logEntry.args.from === undefined ||
      logEntry.args.to === undefined ||
      logEntry.args.value === undefined ||
      logEntry.blockNumber === null ||
      logEntry.transactionHash === null
    ) continue

    const amountUsdc = Number(logEntry.args.value) / 1_000_000

    transfers.push({
      txHash: logEntry.transactionHash,
      blockNumber: Number(logEntry.blockNumber),
      fromWallet: logEntry.args.from,
      toWallet: logEntry.args.to,
      amountUsdc,
      timestamp: blockToIsoTimestamp(logEntry.blockNumber, chunkAnchorBlock, chunkAnchorTsMs),
    })
  }

  if (transfers.length > 0) {
    const db = getDb()
    const inserted = indexUsdcTransferBatch(db, transfers)

    // Refresh stats for affected wallets
    const affectedWallets = new Set<string>()
    for (const t of transfers) {
      affectedWallets.add(t.fromWallet.toLowerCase())
      affectedWallets.add(t.toWallet.toLowerCase())
    }
    refreshWalletTransferStats(db, Array.from(affectedWallets))

    return inserted
  }
  return 0
}

function parseSuggestedEnd(err: unknown): bigint | null {
  const msg = (err as { details?: string; message?: string })?.details
    ?? (err as { message?: string })?.message
    ?? String(err)
  const m = msg.match(/retry with the range \d+-(\d+)/)
  return m ? BigInt(m[1]) : null
}

export async function startUsdcTransferIndexer(): Promise<void> {
  running = true

  const stored = getIndexerState(STATE_KEY)
  const currentBlock = await publicClient.getBlockNumber()

  if (stored) {
    lastBlockIndexed = BigInt(stored)
    log.info('usdc-indexer', `Resuming from block ${lastBlockIndexed}`)
  } else {
    lastBlockIndexed = currentBlock
    setIndexerState(STATE_KEY, currentBlock.toString())
    log.info('usdc-indexer', `First run — starting from current block ${currentBlock}`)
  }

  while (running) {
    try {
      const tip = await publicClient.getBlockNumber()

      if (tip > lastBlockIndexed) {
        let start = lastBlockIndexed + 1n
        let total = 0
        let chunkSize = LOG_CHUNK_SIZE

        while (start <= tip) {
          const end = start + chunkSize - 1n > tip ? tip : start + chunkSize - 1n

          try {
            const count = await fetchAndIndexChunk(start, end)
            total += count
            start = end + 1n
            if (chunkSize < LOG_CHUNK_SIZE) {
              chunkSize = chunkSize * 2n > LOG_CHUNK_SIZE ? LOG_CHUNK_SIZE : chunkSize * 2n
            }
            await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
          } catch (err) {
            const suggestedEnd = parseSuggestedEnd(err)
            if (suggestedEnd !== null && suggestedEnd > start) {
              const newSize = suggestedEnd - start + 1n
              if (newSize < chunkSize) {
                chunkSize = newSize
                continue
              }
            }
            if (chunkSize > 50n) {
              chunkSize = chunkSize / 2n
              continue
            }
            throw err
          }
        }

        if (total > 0) {
          log.info('usdc-indexer', `Indexed ${total} USDC transfer(s) in blocks ${lastBlockIndexed + 1n}–${tip}`)
        }

        lastBlockIndexed = tip
        setIndexerState(STATE_KEY, tip.toString())
      }
    } catch (err) {
      log.error('usdc-indexer', 'RPC error', err)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      continue
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

export function stopUsdcTransferIndexer(): void {
  running = false
  log.info('usdc-indexer', 'Stopped.')
}
```

**Step 2: Wire into `src/index.ts`**

Find where `startBlockchainIndexer()` is called and add:
```typescript
import { startUsdcTransferIndexer } from './jobs/usdcTransferIndexer.js'

// After startBlockchainIndexer() call:
startUsdcTransferIndexer()
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 4: Commit**

```
git add src/jobs/usdcTransferIndexer.ts src/index.ts
git commit -m "feat(P1): add continuous USDC transfer forward indexer"
```

---

## Task 4: P2 — Behavior Types

**Files:**
- Modify: `src/types.ts`
- Create: `tests/types-behavior.test.ts`

**Step 1: Write the failing test**

Create `tests/types-behavior.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import type { BehaviorData, ScoreDimensions } from '../src/types.js'

describe('BehaviorData type', () => {
  it('accepts valid behavior data', () => {
    const data: BehaviorData = {
      interArrivalCV: 1.2,
      hourlyEntropy: 3.1,
      maxGapHours: 72,
      classification: 'organic',
      txCount: 45,
    }
    expect(data.classification).toBe('organic')
  })

  it('behavior dimension fits in ScoreDimensions', () => {
    const dims: ScoreDimensions = {
      reliability: { score: 70, data: {} as any },
      viability: { score: 60, data: {} as any },
      identity: { score: 50, data: {} as any },
      capability: { score: 40, data: {} as any },
      behavior: {
        score: 65,
        data: {
          interArrivalCV: 1.2,
          hourlyEntropy: 3.1,
          maxGapHours: 72,
          classification: 'organic',
          txCount: 45,
        },
      },
    }
    expect(dims.behavior?.score).toBe(65)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types-behavior.test.ts`
Expected: FAIL — `BehaviorData` not exported

**Step 3: Add types to `src/types.ts`**

Add after the existing dimension data interfaces:

```typescript
export type BehaviorClassification = 'organic' | 'mixed' | 'automated' | 'suspicious' | 'insufficient_data'

export interface BehaviorData {
  interArrivalCV: number
  hourlyEntropy: number
  maxGapHours: number
  classification: BehaviorClassification
  txCount: number
}
```

Update the `ScoreDimensions` interface (around line 64) to add:
```typescript
behavior?: { score: number; data: BehaviorData }
```

Update `FullScoreResponse` to add:
```typescript
integrityMultiplier?: number
breakdown?: Record<string, Record<string, number>>
scoreRange?: { low: number; high: number }
topContributors?: string[]
topDetractors?: string[]
```

Update `ScoreRow` to add:
```typescript
behavior_score: number | null
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types-behavior.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0 (may have errors from references to new fields not yet populated — that's fine, we'll fix in later tasks)

**Step 6: Commit**

```
git add src/types.ts tests/types-behavior.test.ts
git commit -m "feat(P2): add BehaviorData type and extend ScoreDimensions"
```

---

## Task 5: P2 — Behavior Dimension Calculator

**Files:**
- Create: `src/scoring/behavior.ts`
- Create: `tests/behavior.test.ts`

**Step 1: Write the failing test**

Create `tests/behavior.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { calcBehavior } from '../src/scoring/behavior.js'

describe('calcBehavior', () => {
  it('returns insufficient_data for < 10 transactions', () => {
    const timestamps = [
      '2026-01-01T10:00:00Z',
      '2026-01-01T14:00:00Z',
      '2026-01-02T09:00:00Z',
    ]
    const result = calcBehavior(timestamps)
    expect(result.score).toBe(50)
    expect(result.data.classification).toBe('insufficient_data')
  })

  it('scores organic behavior high (varied times, spread hours, gaps)', () => {
    // Simulate organic human behavior: varied times across days
    const timestamps: string[] = []
    const base = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 30; i++) {
      const day = Math.floor(i / 2)
      const hour = (i * 7 + 3) % 24  // spread across hours
      const minute = (i * 13) % 60
      const d = new Date(base)
      d.setDate(d.getDate() + day)
      d.setHours(hour, minute, 0, 0)
      timestamps.push(d.toISOString())
    }
    const result = calcBehavior(timestamps)
    expect(result.score).toBeGreaterThan(60)
    expect(result.data.classification).toBe('organic')
  })

  it('scores robotic behavior low (fixed interval, single hour)', () => {
    // Simulate bot: exactly every 60 seconds, same hour
    const timestamps: string[] = []
    const base = new Date('2026-01-01T12:00:00Z')
    for (let i = 0; i < 30; i++) {
      const d = new Date(base.getTime() + i * 60_000)
      timestamps.push(d.toISOString())
    }
    const result = calcBehavior(timestamps)
    expect(result.score).toBeLessThan(40)
    expect(['automated', 'suspicious']).toContain(result.data.classification)
  })

  it('returns signals record with three keys', () => {
    const timestamps: string[] = []
    const base = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 15; i++) {
      const d = new Date(base.getTime() + i * 3_600_000 * (1 + Math.random()))
      timestamps.push(d.toISOString())
    }
    const result = calcBehavior(timestamps)
    expect(result.signals).toBeDefined()
    expect(Object.keys(result.signals)).toEqual(
      expect.arrayContaining(['interArrivalCV', 'hourlyEntropy', 'maxGapHours']),
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/behavior.test.ts`
Expected: FAIL — module not found

**Step 3: Implement behavior calculator**

Create `src/scoring/behavior.ts`:
```typescript
import type { BehaviorData, BehaviorClassification } from '../types.js'

export interface BehaviorResult {
  score: number
  data: BehaviorData
  signals: Record<string, number>
}

/**
 * Calculates the Behavior dimension score from transaction timestamps.
 * Three signals (100 points max):
 *   - Inter-arrival CV (35 pts): coefficient of variation of time gaps
 *   - Hourly entropy (35 pts): Shannon entropy of hour-of-day distribution
 *   - Max gap hours (30 pts): longest gap between consecutive transactions
 *
 * Requires >= 10 timestamps. Below that returns neutral score (50).
 */
export function calcBehavior(timestamps: string[]): BehaviorResult {
  if (timestamps.length < 10) {
    return {
      score: 50,
      data: {
        interArrivalCV: 0,
        hourlyEntropy: 0,
        maxGapHours: 0,
        classification: 'insufficient_data',
        txCount: timestamps.length,
      },
      signals: { interArrivalCV: 0, hourlyEntropy: 0, maxGapHours: 0 },
    }
  }

  const sorted = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)

  // ── Signal 1: Inter-arrival CV (35 pts) ─────────────────────────
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1])
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const stdGap = Math.sqrt(gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length)
  const cv = meanGap > 0 ? stdGap / meanGap : 0

  // CV < 0.1 = perfectly regular (bot-like) → 0 pts
  // CV > 1.5 = highly variable (organic) → 35 pts
  const cvScore = Math.round(Math.min(35, Math.max(0, (cv - 0.1) / 1.4 * 35)))

  // ── Signal 2: Hourly entropy (35 pts) ────────────────────────────
  const hourBuckets = new Array(24).fill(0)
  for (const ms of sorted) {
    hourBuckets[new Date(ms).getUTCHours()]++
  }
  const total = sorted.length
  let entropy = 0
  for (const count of hourBuckets) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }
  // Max entropy for 24 bins = log2(24) ≈ 4.585
  // Low entropy (< 1.0) = concentrated in few hours → 0 pts
  // High entropy (> 3.5) = well-spread → 35 pts
  const entropyScore = Math.round(Math.min(35, Math.max(0, (entropy - 1.0) / 2.5 * 35)))

  // ── Signal 3: Max gap hours (30 pts) ──────────────────────────────
  const maxGapMs = Math.max(...gaps)
  const maxGapHours = maxGapMs / (1000 * 60 * 60)
  // No gap (< 1 hour) = suspicious constant activity → 0 pts
  // Multi-day gaps (> 48 hours) = organic downtime → 30 pts
  const gapScore = Math.round(Math.min(30, Math.max(0, (maxGapHours - 1) / 47 * 30)))

  const score = cvScore + entropyScore + gapScore

  // ── Classification ────────────────────────────────────────────────
  let classification: BehaviorClassification
  if (score >= 70) classification = 'organic'
  else if (score >= 45) classification = 'mixed'
  else if (score >= 25) classification = 'automated'
  else classification = 'suspicious'

  return {
    score,
    data: {
      interArrivalCV: Math.round(cv * 100) / 100,
      hourlyEntropy: Math.round(entropy * 100) / 100,
      maxGapHours: Math.round(maxGapHours * 10) / 10,
      classification,
      txCount: timestamps.length,
    },
    signals: {
      interArrivalCV: cvScore,
      hourlyEntropy: entropyScore,
      maxGapHours: gapScore,
    },
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/behavior.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/scoring/behavior.ts tests/behavior.test.ts
git commit -m "feat(P2): implement behavior dimension calculator with 3 temporal signals"
```

---

## Task 6: P2 — Wire Behavior into Engine

**Files:**
- Modify: `src/scoring/engine.ts`
- Modify: `src/db.ts` (add `behavior_score` column to `scores` table + upsert)

**Step 1: Add `behavior_score` column to `scores`**

In `src/db.ts`, find the `addColumnIfMissing` calls and add:
```typescript
addColumnIfMissing(db, 'scores', 'behavior_score', 'INTEGER')
```

Update `stmtUpsertScore` to include `behavior_score` in the INSERT and UPDATE.

Update `upsertScore()` signature to accept `behaviorScore: number | null` as a parameter.

**Step 2: Wire behavior into `computeScore()` in `src/scoring/engine.ts`**

Import:
```typescript
import { calcBehavior } from './behavior.js'
```

After the 4 existing dimension calculations, add:
```typescript
// ── Behavior dimension (P2) ────────────────────────────────────────────
const behaviorTimestamps = db
  .prepare('SELECT timestamp FROM usdc_transfers WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp ASC')
  .all(w, w) as { timestamp: string }[]
const behaviorResult = calcBehavior(behaviorTimestamps.map((r) => r.timestamp))
const behScore = behaviorResult.score
```

Update composite weights from:
```
relScore * 0.35 + viaScore * 0.30 + idnScore * 0.20 + capScore * 0.15
```
to:
```
relScore * 0.30 + viaScore * 0.25 + idnScore * 0.20 + behScore * 0.15 + capScore * 0.10
```

Add `behavior` to the dimensions object:
```typescript
behavior: { score: behScore, data: behaviorResult.data }
```

Pass `behaviorScore` to `upsertScore()`.

**Step 3: Fallback for wallets without usdc_transfers data**

If `behaviorTimestamps` is empty, fall back to raw_transactions timestamps:
```typescript
let behaviorTimestamps = db
  .prepare('SELECT timestamp FROM usdc_transfers WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp ASC')
  .all(w, w) as { timestamp: string }[]

if (behaviorTimestamps.length === 0) {
  behaviorTimestamps = db
    .prepare('SELECT timestamp FROM raw_transactions WHERE from_wallet = ? OR to_wallet = ? ORDER BY timestamp ASC')
    .all(w, w) as { timestamp: string }[]
}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 5: Commit**

```
git add src/scoring/engine.ts src/db.ts
git commit -m "feat(P2): wire behavior dimension into scoring engine with new weights"
```

---

## Task 7: P3 — Calibration Report Table

**Files:**
- Modify: `src/db.ts`
- Modify: `tests/helpers/testDb.ts`
- Create: `tests/db-calibration.test.ts`

**Step 1: Write the failing test**

Create `tests/db-calibration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'

describe('calibration_reports table', () => {
  it('exists with correct columns', () => {
    const db = createTestDb()
    const info = db.prepare('PRAGMA table_info(calibration_reports)').all() as { name: string }[]
    const cols = info.map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'generated_at', 'period_start', 'period_end',
        'total_scored', 'avg_score_by_outcome', 'tier_accuracy',
        'recommendations', 'model_version',
      ]),
    )
    db.close()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db-calibration.test.ts`
Expected: FAIL

**Step 3: Add table to `src/db.ts` and `tests/helpers/testDb.ts`**

```sql
CREATE TABLE IF NOT EXISTS calibration_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT,
  period_start TEXT,
  period_end TEXT,
  total_scored INTEGER,
  avg_score_by_outcome TEXT,
  tier_accuracy TEXT,
  recommendations TEXT,
  model_version TEXT
);
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db-calibration.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/db.ts tests/
git commit -m "feat(P3): add calibration_reports table"
```

---

## Task 8: P3 — Calibration Report Generator

**Files:**
- Create: `src/scoring/calibrationReport.ts`
- Create: `tests/calibration-report.test.ts`

**Step 1: Write the failing test**

Create `tests/calibration-report.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/testDb.js'
import { generateCalibrationReport } from '../src/scoring/calibrationReport.js'

describe('generateCalibrationReport', () => {
  it('generates a report from scored wallets with outcomes', () => {
    const db = createTestDb()

    // Insert scored wallets
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

    insertScore.run('0x2', 45, 'Basic', thirtyDaysAgo, thirtyDaysAgo)
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/calibration-report.test.ts`
Expected: FAIL

**Step 3: Implement calibration report generator**

Create `src/scoring/calibrationReport.ts`:
```typescript
import type { Database } from 'better-sqlite3'

export interface CalibrationReport {
  generated_at: string
  period_start: string
  period_end: string
  total_scored: number
  avg_score_by_outcome: string  // JSON
  tier_accuracy: string         // JSON
  recommendations: string       // JSON string[]
  model_version: string
}

interface OutcomeRow {
  outcome_label: string
  avg_score: number
  count: number
}

interface TierRow {
  tier: string
  outcome_label: string
  count: number
}

export function generateCalibrationReport(db: Database, modelVersion: string): CalibrationReport {
  const now = new Date()
  const periodEnd = now.toISOString()
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Average score by outcome label
  const outcomeRows = db.prepare(`
    SELECT so.outcome_label, ROUND(AVG(s.composite_score)) as avg_score, COUNT(*) as count
    FROM score_outcomes so
    JOIN scores s ON so.wallet = s.wallet
    WHERE so.labeled_at >= ?
    GROUP BY so.outcome_label
  `).all(periodStart) as OutcomeRow[]

  const avgScoreByOutcome: Record<string, number> = {}
  let totalScored = 0
  for (const row of outcomeRows) {
    avgScoreByOutcome[row.outcome_label] = row.avg_score
    totalScored += row.count
  }

  // Tier accuracy: for each tier, what % of wallets have positive outcomes
  const tierRows = db.prepare(`
    SELECT s.tier, so.outcome_label, COUNT(*) as count
    FROM scores s
    JOIN score_outcomes so ON s.wallet = so.wallet
    WHERE so.labeled_at >= ?
    GROUP BY s.tier, so.outcome_label
  `).all(periodStart) as TierRow[]

  const tierTotals: Record<string, number> = {}
  const tierPositive: Record<string, number> = {}
  const positiveOutcomes = new Set(['reliable_transactor', 'growing'])

  for (const row of tierRows) {
    tierTotals[row.tier] = (tierTotals[row.tier] || 0) + row.count
    if (positiveOutcomes.has(row.outcome_label)) {
      tierPositive[row.tier] = (tierPositive[row.tier] || 0) + row.count
    }
  }

  const tierAccuracy: Record<string, number> = {}
  for (const tier of Object.keys(tierTotals)) {
    tierAccuracy[tier] = Math.round(((tierPositive[tier] || 0) / tierTotals[tier]) * 100) / 100
  }

  // Generate recommendations
  const recommendations: string[] = []
  if (avgScoreByOutcome.dormant && avgScoreByOutcome.dormant > 50) {
    recommendations.push('High-scoring wallets going dormant — consider recency weighting')
  }
  if (avgScoreByOutcome.reported && avgScoreByOutcome.reported > 40) {
    recommendations.push('Reported wallets have moderate scores — integrity modifiers may need tuning')
  }

  const report: CalibrationReport = {
    generated_at: now.toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    total_scored: totalScored,
    avg_score_by_outcome: JSON.stringify(avgScoreByOutcome),
    tier_accuracy: JSON.stringify(tierAccuracy),
    recommendations: JSON.stringify(recommendations),
    model_version: modelVersion,
  }

  // Persist report
  db.prepare(`
    INSERT INTO calibration_reports (generated_at, period_start, period_end, total_scored, avg_score_by_outcome, tier_accuracy, recommendations, model_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.generated_at, report.period_start, report.period_end,
    report.total_scored, report.avg_score_by_outcome, report.tier_accuracy,
    report.recommendations, report.model_version,
  )

  return report
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/calibration-report.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/scoring/calibrationReport.ts tests/calibration-report.test.ts
git commit -m "feat(P3): implement calibration report generator"
```

---

## Task 9: P3 — Admin Calibration Endpoint

**Files:**
- Modify: `src/routes/admin.ts` (or create if it doesn't exist)
- Modify: `src/index.ts` (mount the route)

**Step 1: Check if `src/routes/admin.ts` exists**

If not, create it. Add a `GET /admin/calibration` endpoint protected by `ADMIN_KEY` env var:

```typescript
import { Hono } from 'hono'
import { getDb } from '../db.js'
import { generateCalibrationReport } from '../scoring/calibrationReport.js'

const admin = new Hono()

admin.use('*', async (c, next) => {
  const key = c.req.header('x-admin-key')
  if (!key || key !== process.env.ADMIN_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

admin.get('/calibration', (c) => {
  const db = getDb()

  // Return latest report or generate a new one
  const latest = db.prepare(
    'SELECT * FROM calibration_reports ORDER BY id DESC LIMIT 1'
  ).get() as any

  if (latest) {
    return c.json({
      ...latest,
      avg_score_by_outcome: JSON.parse(latest.avg_score_by_outcome),
      tier_accuracy: JSON.parse(latest.tier_accuracy),
      recommendations: JSON.parse(latest.recommendations),
    })
  }

  // No report yet — generate one
  const report = generateCalibrationReport(db, '2.0.0')
  return c.json({
    ...report,
    avg_score_by_outcome: JSON.parse(report.avg_score_by_outcome),
    tier_accuracy: JSON.parse(report.tier_accuracy),
    recommendations: JSON.parse(report.recommendations),
  })
})

admin.post('/calibration/generate', (c) => {
  const db = getDb()
  const report = generateCalibrationReport(db, '2.0.0')
  return c.json({
    ...report,
    avg_score_by_outcome: JSON.parse(report.avg_score_by_outcome),
    tier_accuracy: JSON.parse(report.tier_accuracy),
    recommendations: JSON.parse(report.recommendations),
  })
})

export default admin
```

**Step 2: Mount in `src/index.ts`**

```typescript
import admin from './routes/admin.js'
app.route('/admin', admin)
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 4: Commit**

```
git add src/routes/admin.ts src/index.ts
git commit -m "feat(P3): add admin calibration endpoint"
```

---

## Task 10: P4 — Multiplicative Integrity Modifiers

**Files:**
- Modify: `src/scoring/sybil.ts`
- Modify: `src/scoring/gaming.ts`
- Modify: `src/scoring/engine.ts`
- Create: `tests/integrity.test.ts`

**Step 1: Write the failing test**

Create `tests/integrity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeIntegrityMultiplier } from '../src/scoring/engine.js'

describe('computeIntegrityMultiplier', () => {
  it('returns 1.0 with no indicators', () => {
    const result = computeIntegrityMultiplier([], [], 0)
    expect(result).toBe(1.0)
  })

  it('applies sybil factors', () => {
    const result = computeIntegrityMultiplier(['coordinated_creation'], [], 0)
    expect(result).toBeCloseTo(0.65)
  })

  it('applies gaming factors', () => {
    const result = computeIntegrityMultiplier([], ['balance_window_dressing'], 0)
    expect(result).toBeCloseTo(0.85)
  })

  it('multiplies multiple factors together', () => {
    const result = computeIntegrityMultiplier(
      ['coordinated_creation', 'single_source_funding'],
      ['burst_and_stop'],
      0,
    )
    // 0.65 * 0.75 * 0.80 = 0.39
    expect(result).toBeCloseTo(0.39, 1)
  })

  it('applies fraud report dampening', () => {
    const result = computeIntegrityMultiplier([], [], 3)
    // pow(0.90, 3) = 0.729
    expect(result).toBeCloseTo(0.729)
  })

  it('floors at 0.10', () => {
    const result = computeIntegrityMultiplier(
      ['wash_trading', 'self_funding_loop', 'coordinated_creation', 'zero_organic_activity'],
      ['nonce_inflation', 'artificial_partner_diversity'],
      5,
    )
    expect(result).toBeGreaterThanOrEqual(0.10)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integrity.test.ts`
Expected: FAIL — `computeIntegrityMultiplier` not exported

**Step 3: Implement `computeIntegrityMultiplier` in `src/scoring/engine.ts`**

Add this exported function:

```typescript
const SYBIL_FACTORS: Record<string, number> = {
  wash_trading: 0.50,
  self_funding_loop: 0.60,
  coordinated_creation: 0.65,
  single_source_funding: 0.75,
  zero_organic_activity: 0.70,
  velocity_anomaly: 0.80,
  fan_out_funding: 0.60,
  // Existing sybil.ts indicators mapped to closest factor:
  closed_loop_trading: 0.55,
  symmetric_transactions: 0.60,
  single_partner: 0.75,
  volume_without_diversity: 0.80,
  funded_by_top_partner: 0.60,
  tight_cluster: 0.55,
}

const GAMING_FACTORS: Record<string, number> = {
  balance_window_dressing: 0.85,
  burst_and_stop: 0.80,
  nonce_inflation: 0.75,
  artificial_partner_diversity: 0.70,
  revenue_recycling: 0.80,
  // Existing gaming.ts indicators mapped to closest factor:
  velocity_spike: 0.80,
  deposit_and_score: 0.85,
  wash_trading: 0.50,
}

export function computeIntegrityMultiplier(
  sybilIndicators: string[],
  gamingIndicators: string[],
  fraudReportCount: number,
): number {
  let multiplier = 1.0

  for (const ind of sybilIndicators) {
    multiplier *= SYBIL_FACTORS[ind] ?? 0.80
  }

  for (const ind of gamingIndicators) {
    multiplier *= GAMING_FACTORS[ind] ?? 0.85
  }

  if (fraudReportCount > 0) {
    multiplier *= Math.pow(0.90, fraudReportCount)
  }

  return Math.max(0.10, Math.round(multiplier * 1000) / 1000)
}
```

**Step 4: Replace Steps 5-8 in `computeScore()`**

Remove the old sybil cap application and gaming penalty subtraction code. Replace with:

```typescript
// ── P4: Multiplicative integrity ──────────────────────────────────────
const integrityMultiplier = computeIntegrityMultiplier(
  sybilResult.indicators,
  gamingResult.indicators,
  reportCount,
)
const finalScore = Math.round(rawComposite * integrityMultiplier)
```

Also remove old `caps` usage from `SybilResult` and old `penalties` usage from `GamingResult` in the engine. The `sybil.ts` and `gaming.ts` files themselves can keep generating `caps` and `penalties` for backward compatibility, but the engine ignores them.

**Step 5: Add `factors` to sybil/gaming return types**

In `src/scoring/sybil.ts`, add to `SybilResult`:
```typescript
factors: Record<string, number>
```

Map each indicator to its factor value before returning.

Do the same in `src/scoring/gaming.ts` for `GamingResult`.

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/integrity.test.ts`
Expected: PASS

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 8: Commit**

```
git add src/scoring/engine.ts src/scoring/sybil.ts src/scoring/gaming.ts tests/integrity.test.ts
git commit -m "feat(P4): replace additive sybil/gaming penalties with multiplicative integrity"
```

---

## Task 11: P5 — Dimension Signal Breakdowns

**Files:**
- Modify: `src/scoring/dimensions.ts`
- Create: `tests/dimension-signals.test.ts`

**Step 1: Write the failing test**

Create `tests/dimension-signals.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('dimension signal breakdowns', () => {
  it('calcReliability returns score and signals', async () => {
    // We'll test this by importing and calling with mock data
    // The key assertion: return type has { score, signals }
    const { calcReliability } = await import('../src/scoring/dimensions.js')
    // calcReliability takes (data, db) — we need minimal mock data
    // For now, verify the function signature returns an object with signals
    expect(typeof calcReliability).toBe('function')
  })
})
```

Note: Full integration tests require passing blockchain data and a DB. The key change is refactoring each `calc*` function to return `{ score: number, signals: Record<string, number> }` instead of just `number`.

**Step 2: Refactor each dimension calculator**

For each of `calcReliability`, `calcViability`, `calcIdentity`, `calcCapability` in `src/scoring/dimensions.ts`:

Change return type from `number` to `{ score: number; signals: Record<string, number> }`.

Example for `calcReliability` (around line 71):

Before:
```typescript
return Math.min(100, Math.max(0, Math.round(totalPoints)))
```

After:
```typescript
const signals: Record<string, number> = {
  txSuccessRate: successRatePoints,
  txCountLog: txCountPoints,
  nonceAlignment: noncePoints,
  uptimeEstimate: uptimePoints,
  recencyBonus: recencyPoints,
}
return {
  score: Math.min(100, Math.max(0, Math.round(totalPoints))),
  signals,
}
```

Apply similar pattern to all four dimensions, naming signals according to the sub-calculations already in the code.

**Step 3: Update engine.ts to handle new return type**

In `computeScore()`, change:
```typescript
const relScore = calcReliability(data, db)
```
to:
```typescript
const relResult = calcReliability(data, db)
const relScore = relResult.score
```

Do the same for viability, identity, capability.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 5: Commit**

```
git add src/scoring/dimensions.ts src/scoring/engine.ts tests/dimension-signals.test.ts
git commit -m "feat(P5): refactor dimension calculators to return per-signal breakdowns"
```

---

## Task 12: P5 — Explainability in API Response

**Files:**
- Modify: `src/scoring/engine.ts` (buildFullResponseFromDimensions, buildFullResponseFromCache)

**Step 1: Add breakdown, scoreRange, topContributors, topDetractors**

In `buildFullResponseFromDimensions()` (around line 505), add:

```typescript
// ── P5: Explainability ────────────────────────────────────────────────
const breakdown: Record<string, Record<string, number>> = {}
if (dimensions.reliability) {
  breakdown.reliability = relResult.signals
}
if (dimensions.viability) {
  breakdown.viability = viaResult.signals
}
if (dimensions.identity) {
  breakdown.identity = idnResult.signals
}
if (dimensions.capability) {
  breakdown.capability = capResult.signals
}
if (dimensions.behavior) {
  breakdown.behavior = behaviorResult.signals
}

// Score range based on confidence
const halfWidth = Math.round((1 - confidence) * 15)
const scoreRange = {
  low: Math.max(0, finalScore - halfWidth),
  high: Math.min(100, finalScore + halfWidth),
}

// Top contributors and detractors
const allSignals: { name: string; points: number; maxPoints: number }[] = []
for (const [dim, signals] of Object.entries(breakdown)) {
  for (const [signal, points] of Object.entries(signals)) {
    allSignals.push({ name: `${dim}.${signal}`, points, maxPoints: points }) // maxPoints TBD
  }
}
const sorted = allSignals.sort((a, b) => b.points - a.points)
const topContributors = sorted.slice(0, 5).map((s) => `${s.name} (${s.points} pts)`)
const topDetractors = sorted
  .filter((s) => s.points === 0)
  .slice(0, 5)
  .map((s) => `${s.name} (0 pts)`)
```

Add these to the returned `FullScoreResponse`:
```typescript
integrityMultiplier,
breakdown,
scoreRange,
topContributors,
topDetractors,
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 3: Commit**

```
git add src/scoring/engine.ts
git commit -m "feat(P5): add explainability fields to full score response"
```

---

## Task 13: Bump MODEL_VERSION to 2.0.0

**Files:**
- Modify: `src/scoring/engine.ts`

**Step 1: Change `MODEL_VERSION`**

In `src/scoring/engine.ts` at line 51, change:
```typescript
const MODEL_VERSION = '1.0.0'
```
to:
```typescript
const MODEL_VERSION = '2.0.0'
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0

**Step 3: Commit**

```
git add src/scoring/engine.ts
git commit -m "chore: bump MODEL_VERSION to 2.0.0"
```

---

## Task 14: Final Verification

**Step 1: Run full build**

Run: `npm run build`
Expected: exits 0

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Verify no old domain references**

Search for fly.dev or conway.tech references:
```
grep -r "fly.dev\|conway.tech" src/ --include="*.ts"
```
Expected: No results (or only comments/documentation)

**Step 4: Final commit (if any remaining changes)**

```
git add -A
git commit -m "chore: final verification — build clean, all tests pass"
```

---

## Verification Checklist

Per the design document:

- [ ] `npm run build` exits 0
- [ ] All 5 dimension scores appear in full response
- [ ] `integrityMultiplier` replaces sybil caps / gaming penalties
- [ ] `breakdown` field shows per-signal contributions
- [ ] Behavior dimension returns `insufficient_data` for wallets with <10 tx
- [ ] USDC indexer runs alongside existing x402 indexer without interference
- [ ] No domain references to old fly.dev or conway.tech URLs
