# DJD Agent Score — Pro-Level Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate the codebase from mid-level to pro-level quality by fixing version inconsistencies, eliminating type escape hatches, hardening security, extracting DRY violations, and adding production safeguards.

**Architecture:** The project is a Hono + TypeScript API with SQLite (better-sqlite3), viem for blockchain, and x402 for payments. Changes are surgical — each task fixes one specific issue without altering the scoring engine's behavior. All changes are tested via vitest.

**Tech Stack:** TypeScript, Hono, vitest, better-sqlite3, viem

---

## Task 1: Centralize MODEL_VERSION (eliminate triple definition)

Three files define `MODEL_VERSION` independently — `responseBuilders.ts` says `'2.0.0'`, while `responseHeaders.ts` and `health.ts` say `'1.0.0'`. This means the API header and health endpoint report a stale version.

**Files:**
- Modify: `src/middleware/responseHeaders.ts:7` — remove local definition, import from `responseBuilders.ts`
- Modify: `src/routes/health.ts:13-14` — remove local definitions, import from `responseBuilders.ts`
- Test: `tests/middleware/responseHeaders.test.ts` (create)
- Test: `tests/routes/health.test.ts` (create)

**Step 1: Write a failing test for the response header version**

Create `tests/middleware/responseHeaders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { responseHeadersMiddleware } from '../../src/middleware/responseHeaders.js'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

describe('responseHeadersMiddleware', () => {
  it('sets X-DJD-Model-Version to the canonical MODEL_VERSION', async () => {
    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.headers.get('X-DJD-Model-Version')).toBe(MODEL_VERSION)
    expect(MODEL_VERSION).toBe('2.0.0')
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/middleware/responseHeaders.test.ts`
Expected: FAIL — the header returns `'1.0.0'` but test expects `'2.0.0'`

**Step 3: Fix `responseHeaders.ts` — import canonical version**

In `src/middleware/responseHeaders.ts`, replace line 7:

```typescript
// REMOVE:
export const MODEL_VERSION = '1.0.0'

// ADD (keep the export so downstream consumers aren't broken):
export { MODEL_VERSION } from '../scoring/responseBuilders.js'
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/middleware/responseHeaders.test.ts`
Expected: PASS

**Step 5: Write a failing test for the health endpoint version**

Create `tests/routes/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import healthRoute from '../../src/routes/health.js'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

describe('GET /health', () => {
  it('returns the canonical MODEL_VERSION', async () => {
    const app = new Hono()
    app.route('/health', healthRoute)

    const res = await app.request('/health')
    const body = await res.json()
    expect(body.modelVersion).toBe(MODEL_VERSION)
    expect(body.modelVersion).toBe('2.0.0')
  })
})
```

**Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/routes/health.test.ts`
Expected: FAIL — health returns `'1.0.0'`

**Step 7: Fix `health.ts` — import canonical version**

In `src/routes/health.ts`:

```typescript
// REMOVE these two lines (lines 13-14):
const VERSION = '1.0.0'
const MODEL_VERSION = '1.0.0'

// ADD this import at the top (after line 10):
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

// In the response body, change:
//   version: VERSION,
// to:
//   version: MODEL_VERSION,
```

**Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/routes/health.test.ts`
Expected: PASS

**Step 9: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 10: Check for stale MODEL_VERSION imports**

Run: `grep -rn "MODEL_VERSION" src/ --include="*.ts" | grep -v responseBuilders | grep -v "from.*responseBuilders"`
Expected: No files define their own `MODEL_VERSION` anymore

**Step 11: Commit**

```bash
git add src/middleware/responseHeaders.ts src/routes/health.ts \
  tests/middleware/responseHeaders.test.ts tests/routes/health.test.ts
git commit -m "fix: centralize MODEL_VERSION to single source of truth

responseHeaders.ts and health.ts were reporting '1.0.0' while
responseBuilders.ts had '2.0.0'. Now all import from one place."
```

---

## Task 2: Eliminate type escape hatches in freeTier.ts

`freeTier.ts:61-62` uses double type assertion (`as unknown as Record<string, unknown>`) to access `confidence` and `recommendation`. This is unnecessary: `getOrCalculateScore()` returns `FullScoreResponse & { stale?: boolean }`, which already has both fields via `BasicScoreResponse`.

**Files:**
- Modify: `src/middleware/freeTier.ts:61-62`
- Test: `tests/middleware/freeTier.test.ts` (create)

**Step 1: Write a test that verifies free-tier response shape**

Create `tests/middleware/freeTier.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { freeTierMiddleware } from '../../src/middleware/freeTier.js'

vi.mock('../../src/db.js', () => ({
  countFreeTierUsesToday: vi.fn().mockReturnValue(0),
}))

vi.mock('../../src/scoring/engine.js', () => ({
  getOrCalculateScore: vi.fn().mockResolvedValue({
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    score: 75,
    tier: 'Trusted',
    confidence: 0.85,
    recommendation: 'generally_reliable',
    modelVersion: '2.0.0',
    lastUpdated: '2026-02-23T00:00:00Z',
    computedAt: '2026-02-23T00:00:00Z',
    scoreFreshness: 1.0,
  }),
  MODEL_VERSION: '2.0.0',
}))

describe('freeTierMiddleware', () => {
  it('returns confidence and recommendation from the result', async () => {
    const app = new Hono()
    app.use('/v1/score/basic', freeTierMiddleware)

    const res = await app.request(
      '/v1/score/basic?wallet=0x1234567890abcdef1234567890abcdef12345678',
    )
    const body = await res.json()

    expect(body.confidence).toBe(0.85)
    expect(body.recommendation).toBe('generally_reliable')
    expect(body.freeTier).toBe(true)
  })
})
```

**Step 2: Run the test to verify it passes (baseline)**

Run: `npx vitest run tests/middleware/freeTier.test.ts`
Expected: PASS — behavior is the same, we're just establishing a baseline

**Step 3: Remove the type escape hatches**

In `src/middleware/freeTier.ts`, change lines 61-62:

```typescript
// BEFORE:
    confidence: (result as unknown as Record<string, unknown>).confidence ?? 0,
    recommendation: (result as unknown as Record<string, unknown>).recommendation ?? 'insufficient_history',

// AFTER:
    confidence: result.confidence,
    recommendation: result.recommendation,
```

**Step 4: Run TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: No new errors (result is `FullScoreResponse` which has both fields)

**Step 5: Run tests again**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/middleware/freeTier.ts tests/middleware/freeTier.test.ts
git commit -m "fix: remove type escape hatches in freeTier.ts

getOrCalculateScore() returns FullScoreResponse which has confidence
and recommendation. The double type assertions were unnecessary."
```

---

## Task 3: Add Hono env types for c.set()/c.get()

`freeTier.ts:55` uses `c.set('freeTier' as never, true)` because Hono needs a type declaration for custom context variables. Fix by declaring an `AppEnv` type.

**Files:**
- Create: `src/types/hono-env.ts`
- Modify: `src/index.ts:44` — add generic type parameter
- Modify: `src/middleware/freeTier.ts:55` — remove `as never`

**Step 1: Check what context variables exist**

Run: `grep -rn "c\.set\|c\.get" src/ --include="*.ts"`
Document all keys used (at minimum: `freeTier`).

**Step 2: Create the env type**

Create `src/types/hono-env.ts`:

```typescript
export type AppEnv = {
  Variables: {
    freeTier: boolean
  }
}
```

**Step 3: Apply to Hono app in index.ts**

```typescript
// ADD import:
import type { AppEnv } from './types/hono-env.js'

// CHANGE line 44:
// BEFORE: const app = new Hono()
// AFTER:
const app = new Hono<AppEnv>()
```

**Step 4: Remove the `as never` cast**

In `src/middleware/freeTier.ts:55`:

```typescript
// BEFORE:
  c.set('freeTier' as never, true)
// AFTER:
  c.set('freeTier', true)
```

**Step 5: Run TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 7: Commit**

```bash
git add src/types/hono-env.ts src/index.ts src/middleware/freeTier.ts
git commit -m "feat: add Hono env types, remove 'as never' cast

Declare AppEnv with Variables so c.set()/c.get() are type-safe."
```

---

## Task 4: Guard admin routes when ADMIN_KEY is unset

`src/routes/admin.ts:10` compares against `process.env.ADMIN_KEY`. If that env var isn't set, the comparison `key !== undefined` returns `true` for any provided key, so the middleware correctly rejects — but it's a silent misconfiguration. Add an explicit guard and meaningful error.

**Files:**
- Modify: `src/routes/admin.ts:8-14`
- Test: `tests/routes/admin.test.ts` (create)

**Step 1: Write a test for the unset ADMIN_KEY case**

Create `tests/routes/admin.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { Hono } from 'hono'

describe('admin middleware', () => {
  const originalKey = process.env.ADMIN_KEY

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ADMIN_KEY = originalKey
    } else {
      delete process.env.ADMIN_KEY
    }
  })

  it('returns 503 when ADMIN_KEY is not configured', async () => {
    delete process.env.ADMIN_KEY
    // Dynamic import to pick up env change
    const mod = await import('../../src/routes/admin.js')
    const app = new Hono()
    app.route('/admin', mod.default)

    const res = await app.request('/admin/calibration', {
      headers: { 'x-admin-key': 'anything' },
    })
    expect(res.status).toBe(503)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run tests/routes/admin.test.ts`
Expected: FAIL — currently returns 401, not 503

**Step 3: Add the guard**

In `src/routes/admin.ts`, replace the middleware:

```typescript
if (!process.env.ADMIN_KEY) {
  console.warn('[SECURITY] ADMIN_KEY not set — admin routes will reject all requests')
}

admin.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return c.json({ error: 'Admin key not configured' }, 503)
  }
  const key = c.req.header('x-admin-key')
  if (!key || key !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})
```

**Step 4: Run test**

Run: `npx vitest run tests/routes/admin.test.ts`
Expected: PASS

**Step 5: Run full suite**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/routes/admin.ts tests/routes/admin.test.ts
git commit -m "fix: guard admin routes when ADMIN_KEY is not set

Returns 503 with warning log instead of silently rejecting."
```

---

## Task 5: Extract prepared statements from upsertScoreTxn

`src/db/queries.ts:235-248` has three `db.prepare()` calls inside the transaction. They recompile SQL on every score write. Extract to module-level.

**Files:**
- Modify: `src/db/queries.ts:235-248`

**Step 1: Add prepared statements near the other module-level ones**

Find where `stmtInsertHistory`, `stmtGetScore`, etc. are defined and add:

```typescript
const stmtInsertDecay = db.prepare(
  `INSERT INTO score_decay (wallet, composite_score) VALUES (?, ?)`
)
const stmtUpdateWalletIndex = db.prepare(
  `UPDATE wallet_index SET is_scored = 1, last_seen = ? WHERE wallet = ?`
)
const stmtPruneHistory = db.prepare(
  `DELETE FROM score_history WHERE wallet = ? AND id NOT IN
   (SELECT id FROM score_history WHERE wallet = ? ORDER BY calculated_at DESC LIMIT 50)`
)
```

**Step 2: Replace inline calls inside the transaction**

```typescript
// BEFORE (3 inline db.prepare().run() calls):
    db.prepare(`INSERT INTO score_decay ...`).run(wallet, compositeScore)
    db.prepare(`UPDATE wallet_index ...`).run(now.toISOString(), wallet)
    db.prepare(`DELETE FROM score_history ...`).run(wallet, wallet)

// AFTER:
    stmtInsertDecay.run(wallet, compositeScore)
    stmtUpdateWalletIndex.run(now.toISOString(), wallet)
    stmtPruneHistory.run(wallet, wallet)
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All pass (pure refactor, same behavior)

**Step 4: Commit**

```bash
git add src/db/queries.ts
git commit -m "perf: extract prepared statements from upsertScoreTxn

Three db.prepare() calls recompiled SQL on every score write."
```

---

## Task 6: Add NOT NULL constraints to usdc_transfers

`src/db/schema.ts:280-286` creates `usdc_transfers` without NOT NULL on critical columns.

**Files:**
- Modify: `src/db/schema.ts:279-286`

**Step 1: Update the CREATE TABLE statement**

```sql
-- BEFORE:
CREATE TABLE IF NOT EXISTS usdc_transfers (
  tx_hash TEXT UNIQUE,
  block_number INTEGER,
  from_wallet TEXT,
  to_wallet TEXT,
  amount_usdc REAL,
  timestamp TEXT
);

-- AFTER:
CREATE TABLE IF NOT EXISTS usdc_transfers (
  tx_hash TEXT NOT NULL UNIQUE,
  block_number INTEGER NOT NULL,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  amount_usdc REAL NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Note: SQLite `CREATE TABLE IF NOT EXISTS` won't alter existing tables. This only affects new databases/test runs.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "fix: add NOT NULL constraints to usdc_transfers schema

tx_hash, block_number, from_wallet, to_wallet should never be null."
```

---

## Task 7: DRY — Extract scoring helpers in calcIdentity

`src/scoring/dimensions.ts` duplicates GitHub activity scoring (lines 306-318 and 350-358) and wallet age scoring (lines 334-339 and 359-364).

**Files:**
- Modify: `src/scoring/dimensions.ts`
- Test: `tests/scoring/dimensions.test.ts` (create or extend)

**Step 1: Write a baseline test**

Create `tests/scoring/dimensions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcIdentity } from '../../src/scoring/dimensions.js'

describe('calcIdentity', () => {
  it('signal breakdown sums to total raw score', () => {
    const result = calcIdentity({
      isRegistered: true,
      basename: 'test-agent',
      githubVerified: true,
      githubStars: 10,
      githubPushedAt: new Date().toISOString(),
      walletAgeDays: 200,
    })

    const signalSum = Object.values(result.signals).reduce((a, b) => a + b, 0)
    expect(result.raw).toBe(signalSum)
  })

  it('gives zero github activity when not verified', () => {
    const result = calcIdentity({
      isRegistered: false,
      basename: null,
      githubVerified: false,
      githubStars: 100,
      githubPushedAt: new Date().toISOString(),
      walletAgeDays: 0,
    })
    expect(result.signals.githubActivity).toBe(0)
  })
})
```

**Step 2: Run the baseline test**

Run: `npx vitest run tests/scoring/dimensions.test.ts`
Expected: PASS

**Step 3: Extract helper functions**

Add before `calcIdentity` in `src/scoring/dimensions.ts`:

```typescript
function calcGithubActivityPts(
  githubVerified: boolean,
  githubStars: number | null | undefined,
  githubPushedAt: string | null | undefined,
): number {
  if (!githubVerified) return 0
  let pts = 0
  if ((githubStars ?? 0) >= 5) pts += 5
  else if ((githubStars ?? 0) >= 1) pts += 3
  if (githubPushedAt) {
    const daysSincePush = (Date.now() - new Date(githubPushedAt).getTime()) / 86_400_000
    if (daysSincePush <= 30) pts += 10
    else if (daysSincePush <= 90) pts += 5
  }
  return pts
}

function calcWalletAgePts(walletAgeDays: number | null | undefined): number {
  const ageDays = walletAgeDays ?? 0
  if (ageDays > 180) return 30
  if (ageDays > 90) return 20
  if (ageDays > 30) return 15
  if (ageDays > 7) return 8
  return 2
}
```

**Step 4: Replace both copies in calcIdentity**

Replace lines 306-318 (first github activity block):

```typescript
// BEFORE: 12 lines of inline github activity scoring
// AFTER:
  pts += calcGithubActivityPts(githubVerified, githubStars, githubPushedAt)
```

Replace lines 334-339 (first wallet age block):

```typescript
// BEFORE: 6 lines of inline wallet age scoring
// AFTER:
  pts += calcWalletAgePts(walletAgeDays)
```

Replace lines 349-358 (second github activity — for signals breakdown):

```typescript
// BEFORE: let githubActivityPts = 0; if (githubVerified) { ... }
// AFTER:
  const githubActivityPts = calcGithubActivityPts(githubVerified, githubStars, githubPushedAt)
```

Replace lines 359-364 (second wallet age — for signals breakdown):

```typescript
// BEFORE: let walletAgePts = 0; if (...) walletAgePts = ...
// AFTER:
  const walletAgePts = calcWalletAgePts(walletAgeDays)
```

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/scoring/dimensions.ts tests/scoring/dimensions.test.ts
git commit -m "refactor: DRY github activity and wallet age scoring

Extracted calcGithubActivityPts() and calcWalletAgePts() helpers."
```

---

## Task 8: Rate limit fraud reports

`src/routes/report.ts` allows unlimited reports. Anyone can grief-bomb a wallet to zero score.

**Files:**
- Modify: `src/routes/report.ts`
- Modify: `src/db.ts` or `src/db/queries.ts` — add query
- Test: `tests/routes/report.test.ts` (create)

**Step 1: Write a failing test**

Create `tests/routes/report.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import reportRoute from '../../src/routes/report.js'

describe('POST /v1/report rate limiting', () => {
  it('rejects duplicate reports from same reporter to same target', async () => {
    const app = new Hono()
    app.route('/v1/report', reportRoute)

    const body = {
      target: '0x1111111111111111111111111111111111111111',
      reporter: '0x2222222222222222222222222222222222222222',
      reason: 'malicious_behavior',
      details: 'Test report',
    }

    const res1 = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res1.status).toBe(201)

    // Same reporter, same target = reject
    const res2 = await app.request('/v1/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res2.status).toBe(429)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npx vitest run tests/routes/report.test.ts`
Expected: FAIL — second request returns 201

**Step 3: Add the query**

In the db queries file, add:

```typescript
const stmtCountReporterReports = db.prepare(
  `SELECT COUNT(*) as count FROM fraud_reports
   WHERE reporter_wallet = ? AND target_wallet = ?`
)

export function countReporterReportsForTarget(reporter: string, target: string): number {
  return (stmtCountReporterReports.get(reporter, target) as { count: number })?.count ?? 0
}
```

**Step 4: Add the check in report.ts**

After validation, before creating the report:

```typescript
import { countReporterReportsForTarget } from '../db.js'

  const existingReports = countReporterReportsForTarget(
    reporter.toLowerCase(),
    target.toLowerCase(),
  )
  if (existingReports >= 3) {
    return c.json({ error: 'Report limit reached for this reporter/target pair' }, 429)
  }
```

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add src/routes/report.ts src/db.ts tests/routes/report.test.ts
git commit -m "fix: rate limit fraud reports (max 3 per reporter per target)

Prevents grief-bombing a wallet's score to zero."
```

---

## Task 9: Add request body size limit

`src/index.ts` has no body size limit. Add Hono's `bodyLimit` middleware.

**Files:**
- Modify: `src/index.ts`

**Step 1: Add the middleware**

```typescript
import { bodyLimit } from 'hono/body-limit'

// After cors() line:
app.use('*', bodyLimit({
  maxSize: 100 * 1024, // 100 KB
  onError: (c) => c.json({ error: 'Request body too large' }, 413),
}))
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "fix: add 100KB request body size limit"
```

---

## Task 10: Validate SQL identifiers in addColumnIfMissing

`src/db/schema.ts:53-58` uses string interpolation for table/column names. Add a regex guard.

**Files:**
- Modify: `src/db/schema.ts:53-58`

**Step 1: Add validation**

```typescript
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!VALID_IDENTIFIER.test(table) || !VALID_IDENTIFIER.test(column)) {
    throw new Error(`Invalid SQL identifier: table=${table}, column=${column}`)
  }
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "fix: validate SQL identifiers in addColumnIfMissing"
```

---

## Task 11: Make CORS configurable

`src/index.ts` uses `cors()` with no restrictions.

**Files:**
- Modify: `src/index.ts:49`
- Modify: `.env.example`

**Step 1: Configure CORS**

```typescript
app.use('*', cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}))
```

**Step 2: Document in .env.example**

```bash
# Comma-separated allowed CORS origins (leave unset for open in dev)
# CORS_ORIGINS=https://djd-agent-score.fly.dev,https://yourfrontend.com
```

**Step 3: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/index.ts .env.example
git commit -m "fix: make CORS configurable via CORS_ORIGINS env var"
```

---

## Task 12: Fix graceful shutdown to drain requests

`src/index.ts:121-126` calls `process.exit(0)` without draining in-flight requests.

**Files:**
- Modify: `src/index.ts:117-139`

**Step 1: Capture server reference and update shutdown**

```typescript
let server: ReturnType<typeof serve> | null = null
let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log.info('server', 'Shutting down...')

  for (const id of intervals) clearInterval(id)
  stopBlockchainIndexer()
  stopUsdcTransferIndexer()

  if (server) {
    server.close(() => {
      log.info('server', 'All connections closed')
      db.close()
      process.exit(0)
    })
    setTimeout(() => {
      log.warn('server', 'Forcing exit after 10s timeout')
      db.close()
      process.exit(1)
    }, 10_000).unref()
  } else {
    db.close()
    process.exit(0)
  }
}

// Capture the server reference:
server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  // ... existing startup logs
})
```

**Step 2: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/index.ts
git commit -m "fix: drain in-flight requests on graceful shutdown

Wait for connections to close, force exit after 10s. Close SQLite db."
```

---

## Summary

| Task | Issue | Severity | Type |
|------|-------|----------|------|
| 1 | MODEL_VERSION mismatch (3 definitions) | CRITICAL | Bug fix |
| 2 | Type escape hatches in freeTier.ts | HIGH | Code quality |
| 3 | Hono env types for c.set()/c.get() | HIGH | Code quality |
| 4 | Admin key env var guard | CRITICAL | Security |
| 5 | Inline db.prepare() in transaction | HIGH | Performance |
| 6 | usdc_transfers NOT NULL constraints | HIGH | Data integrity |
| 7 | DRY violations in calcIdentity | HIGH | Code quality |
| 8 | No rate limiting on fraud reports | MEDIUM | Security |
| 9 | No request body size limit | MEDIUM | Security |
| 10 | SQL identifier interpolation | MEDIUM | Security |
| 11 | Open CORS | MEDIUM | Security |
| 12 | Graceful shutdown doesn't drain | MEDIUM | Production |

**Order:** Tasks 1-4 are CRITICAL/HIGH — do these first. Tasks 5-7 are HIGH refactors. Tasks 8-12 are MEDIUM hardening.

**Estimated total:** 2-3 hours with TDD workflow.
