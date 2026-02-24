import { beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const VALID_WALLET_LOWER = VALID_WALLET.toLowerCase()
const ADMIN_KEY = 'a]S5m&K#R9pL!vX2wQ8zN$jT3dF6gH0y'

// ── In-memory DB (hoisted so it's available during vi.mock factory) ─────────
const { testDb } = vi.hoisted(() => {
  const _Database = require('better-sqlite3')
  const db = new _Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      wallet TEXT PRIMARY KEY,
      composite_score INTEGER NOT NULL,
      reliability_score INTEGER NOT NULL DEFAULT 0,
      viability_score INTEGER NOT NULL DEFAULT 0,
      identity_score INTEGER NOT NULL DEFAULT 0,
      capability_score INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL,
      raw_data TEXT NOT NULL DEFAULT '{}',
      calculated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confidence REAL DEFAULT 0.0,
      recommendation TEXT DEFAULT 'insufficient_history',
      model_version TEXT DEFAULT '1.0.0',
      sybil_flag INTEGER DEFAULT 0,
      sybil_indicators TEXT DEFAULT '[]',
      gaming_indicators TEXT DEFAULT '[]',
      behavior_score INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_registrations (
      wallet TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      github_url TEXT,
      website_url TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      tier TEXT NOT NULL,
      score_at_certification INTEGER NOT NULL,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      tx_hash TEXT,
      revoked_at TEXT,
      revocation_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_certs_wallet ON certifications(wallet);
    CREATE INDEX IF NOT EXISTS idx_certs_active ON certifications(is_active, expires_at);
  `)
  return { testDb: db }
})

vi.mock('../../src/db.js', () => ({
  db: testDb,
}))

import { Hono } from 'hono'
import certificationRoute from '../../src/routes/certification.js'

function createApp() {
  const app = new Hono()
  app.route('/v1/certification', certificationRoute)
  return app
}

// ── Seed helpers ────────────────────────────────────────────────────────────

function seedGoodScore(wallet: string) {
  const futureDate = new Date(Date.now() + 86400000).toISOString()
  testDb
    .prepare(`
    INSERT INTO scores (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score, tier, raw_data, calculated_at, expires_at, confidence)
    VALUES (?, 82, 80, 75, 85, 78, 'Trusted', '{}', datetime('now'), ?, 0.85)
  `)
    .run(wallet, futureDate)
}

function seedLowScore(wallet: string) {
  const futureDate = new Date(Date.now() + 86400000).toISOString()
  testDb
    .prepare(`
    INSERT INTO scores (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score, tier, raw_data, calculated_at, expires_at, confidence)
    VALUES (?, 60, 55, 50, 65, 60, 'Emerging', '{}', datetime('now'), ?, 0.70)
  `)
    .run(wallet, futureDate)
}

function seedExpiredScore(wallet: string) {
  const pastDate = new Date(Date.now() - 86400000).toISOString()
  testDb
    .prepare(`
    INSERT INTO scores (wallet, composite_score, reliability_score, viability_score, identity_score, capability_score, tier, raw_data, calculated_at, expires_at, confidence)
    VALUES (?, 82, 80, 75, 85, 78, 'Trusted', '{}', datetime('now', '-30 days'), ?, 0.85)
  `)
    .run(wallet, pastDate)
}

function seedRegistration(wallet: string) {
  testDb
    .prepare(`
    INSERT INTO agent_registrations (wallet, name) VALUES (?, ?)
  `)
    .run(wallet, 'Test Agent')
}

function seedCertification(wallet: string) {
  testDb
    .prepare(`
    INSERT INTO certifications (wallet, tier, score_at_certification, expires_at)
    VALUES (?, 'Trusted', 82, datetime('now', '+1 year'))
  `)
    .run(wallet)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Certification routes', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM scores')
    testDb.exec('DELETE FROM agent_registrations')
    testDb.exec('DELETE FROM certifications')
    process.env.ADMIN_KEY = ADMIN_KEY
  })

  // ── POST /apply ───────────────────────────────────────────────────────────

  describe('POST /v1/certification/apply', () => {
    it('grants certification for qualified agent (score >= 75, registered)', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
        headers: { 'x-payer-address': VALID_WALLET },
      })

      expect(res.status).toBe(201)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.wallet).toBe(VALID_WALLET_LOWER)
      expect(body.tier).toBe('Trusted')
      expect(body.score_at_certification).toBe(82)
      expect(body.is_active).toBe(true)
      expect(body.message).toContain('1 year')
      expect(body.granted_at).toBeDefined()
      expect(body.expires_at).toBeDefined()
    })

    it('rejects with cert_score_too_low when score < 75', async () => {
      seedLowScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
        headers: { 'x-payer-address': VALID_WALLET },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string; details?: Record<string, unknown> } }
      expect(body.error.code).toBe('cert_score_too_low')
      expect(body.error.details?.current_score).toBe(60)
    })

    it('rejects with cert_not_registered when agent is not registered', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      // No registration seeded

      const app = createApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
        headers: { 'x-payer-address': VALID_WALLET },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('cert_not_registered')
    })

    it('rejects with cert_already_active when wallet already certified', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
        headers: { 'x-payer-address': VALID_WALLET },
      })

      expect(res.status).toBe(409)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('cert_already_active')
    })

    it('rejects with cert_requirements_not_met when score is expired', async () => {
      seedExpiredScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
        headers: { 'x-payer-address': VALID_WALLET },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('cert_requirements_not_met')
    })
  })

  // ── GET /:wallet ──────────────────────────────────────────────────────────

  describe('GET /v1/certification/:wallet', () => {
    it('returns cert details with is_valid: true for certified wallet', async () => {
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request(`/v1/certification/${VALID_WALLET}`)

      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.wallet).toBe(VALID_WALLET_LOWER)
      expect(body.tier).toBe('Trusted')
      expect(body.score_at_certification).toBe(82)
      expect(body.is_valid).toBe(true)
      expect(body.granted_at).toBeDefined()
      expect(body.expires_at).toBeDefined()
    })

    it('returns 404 cert_not_found for uncertified wallet', async () => {
      const app = createApp()
      const res = await app.request(`/v1/certification/${VALID_WALLET}`)

      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('cert_not_found')
    })
  })

  // ── GET /badge/:wallet ────────────────────────────────────────────────────

  describe('GET /v1/certification/badge/:wallet', () => {
    it('returns green SVG badge with score for certified wallet', async () => {
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request(`/v1/certification/badge/${VALID_WALLET}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/svg+xml')
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600')

      const svg = await res.text()
      expect(svg).toContain('#16a34a') // green color
      expect(svg).toContain('Score 82')
    })

    it('returns gray SVG badge for uncertified wallet', async () => {
      const app = createApp()
      const res = await app.request(`/v1/certification/badge/${VALID_WALLET}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/svg+xml')

      const svg = await res.text()
      expect(svg).toContain('#6b7280') // gray color
      expect(svg).toContain('not certified')
    })
  })

  // ── Admin routes ──────────────────────────────────────────────────────────

  describe('GET /v1/certification/admin/all', () => {
    it('returns 401 without admin key', async () => {
      const app = createApp()
      const res = await app.request('/v1/certification/admin/all')

      expect(res.status).toBe(401)
    })

    it('returns list of certs with valid admin key', async () => {
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/admin/all', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { certifications: unknown[]; count: number }
      expect(body.count).toBe(1)
      expect(body.certifications).toHaveLength(1)
    })
  })

  describe('POST /v1/certification/admin/:id/revoke', () => {
    it('revokes certification and subsequent GET shows not certified', async () => {
      seedCertification(VALID_WALLET_LOWER)

      // Get the cert ID
      const cert = testDb.prepare('SELECT id FROM certifications WHERE wallet = ?').get(VALID_WALLET_LOWER) as {
        id: number
      }

      const app = createApp()

      // Revoke
      const revokeRes = await app.request(`/v1/certification/admin/${cert.id}/revoke`, {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Fraudulent activity detected' }),
      })

      expect(revokeRes.status).toBe(200)
      const revokeBody = (await revokeRes.json()) as Record<string, unknown>
      expect(revokeBody.success).toBe(true)
      expect(revokeBody.reason).toBe('Fraudulent activity detected')

      // Verify cert is no longer valid
      const checkRes = await app.request(`/v1/certification/${VALID_WALLET}`)
      expect(checkRes.status).toBe(404)
      const checkBody = (await checkRes.json()) as { error: { code: string } }
      expect(checkBody.error.code).toBe('cert_not_found')
    })
  })
})
