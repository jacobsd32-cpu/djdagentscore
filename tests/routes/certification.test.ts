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
      github_verified INTEGER NOT NULL DEFAULT 0,
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
  getScore: (wallet: string) => testDb.prepare('SELECT * FROM scores WHERE wallet = ? LIMIT 1').get(wallet),
  getRegistration: (wallet: string) =>
    testDb.prepare('SELECT * FROM agent_registrations WHERE wallet = ? LIMIT 1').get(wallet),
  getActiveCertification: (wallet: string) =>
    testDb
      .prepare(
        `SELECT * FROM certifications
       WHERE wallet = ? AND is_active = 1 AND expires_at > datetime('now')
       LIMIT 1`,
      )
      .get(wallet),
  insertCertification: (wallet: string, tier: string, scoreAtCertification: number) => {
    const result = testDb
      .prepare(
        `INSERT INTO certifications (wallet, tier, score_at_certification, expires_at)
         VALUES (?, ?, ?, datetime('now', '+1 year'))`,
      )
      .run(wallet, tier, scoreAtCertification)
    return testDb.prepare('SELECT * FROM certifications WHERE id = ?').get(Number(result.lastInsertRowid))
  },
  listCertifications: () => testDb.prepare('SELECT * FROM certifications ORDER BY granted_at DESC').all(),
  listActiveCertificationDirectory: (limit: number, tier?: string | null) =>
    testDb
      .prepare(
        `SELECT
           c.id,
           c.wallet,
           c.tier,
           c.score_at_certification,
           c.granted_at,
           c.expires_at,
           c.is_active,
           c.tx_hash,
           c.revoked_at,
           c.revocation_reason,
           s.composite_score AS current_score,
           s.tier AS current_tier,
           s.confidence AS current_confidence,
           r.name,
           r.description,
           r.github_url,
           r.website_url,
           COALESCE(r.github_verified, 0) AS github_verified
         FROM certifications c
         LEFT JOIN scores s ON s.wallet = c.wallet
         LEFT JOIN agent_registrations r ON r.wallet = c.wallet
         WHERE c.is_active = 1
           AND c.expires_at > datetime('now')
           AND (? IS NULL OR c.tier = ?)
         ORDER BY COALESCE(s.composite_score, c.score_at_certification) DESC, c.granted_at DESC
         LIMIT ?`,
      )
      .all(tier ?? null, tier ?? null, limit),
  revokeCertification: (id: number, reason: string) =>
    testDb
      .prepare(
        `UPDATE certifications
       SET is_active = 0, revoked_at = datetime('now'), revocation_reason = ?
       WHERE id = ? AND is_active = 1`,
      )
      .run(reason, id).changes > 0,
  getCertificationRevenueSummary: () => {
    const total = (testDb.prepare('SELECT COUNT(*) as count FROM certifications').get() as { count: number }).count
    const active = (
      testDb
        .prepare(`SELECT COUNT(*) as count FROM certifications WHERE is_active = 1 AND expires_at > datetime('now')`)
        .get() as { count: number }
    ).count
    const revoked = (
      testDb.prepare('SELECT COUNT(*) as count FROM certifications WHERE revoked_at IS NOT NULL').get() as {
        count: number
      }
    ).count
    const byMonth = testDb
      .prepare(
        `SELECT
         strftime('%Y-%m', granted_at) as month,
         COUNT(*) as count,
         SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked_count,
         SUM(99) as gross_revenue_usd,
         SUM(CASE WHEN revoked_at IS NULL THEN 99 ELSE 0 END) as net_revenue_usd
       FROM certifications
       GROUP BY strftime('%Y-%m', granted_at)
       ORDER BY month DESC`,
      )
      .all()

    return {
      total_certifications: total,
      active_certifications: active,
      revoked_certifications: revoked,
      gross_revenue_usd: total * 99,
      net_revenue_usd: (total - revoked) * 99,
      price_per_cert_usd: 99,
      by_month: byMonth,
    }
  },
}))

import { Hono } from 'hono'
import certificationRoute from '../../src/routes/certification.js'

function createApp() {
  const app = new Hono()
  app.route('/v1/certification', certificationRoute)
  return app
}

function createApiKeyAuthenticatedApp(wallet = VALID_WALLET_LOWER) {
  const app = new Hono()
  app.use('/v1/certification/*', async (c, next) => {
    c.set('apiKeyId', 1)
    c.set('apiKeyWallet', wallet)
    c.set('apiKeyTier', 'starter')
    await next()
  })
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

  describe('GET /v1/certification/readiness', () => {
    it('returns can_apply true for an eligible wallet', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request(`/v1/certification/readiness?wallet=${VALID_WALLET}`)

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        can_apply: boolean
        status: string
        payment: { amount_usdc: number }
        requirements: { registration: { met: boolean }; score: { met: boolean; current_score: number | null } }
      }

      expect(body.can_apply).toBe(true)
      expect(body.status).toBe('eligible')
      expect(body.payment.amount_usdc).toBe(99)
      expect(body.requirements.registration.met).toBe(true)
      expect(body.requirements.score.met).toBe(true)
      expect(body.requirements.score.current_score).toBe(82)
    })

    it('returns not_registered when registration is missing', async () => {
      seedGoodScore(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request(`/v1/certification/readiness?wallet=${VALID_WALLET}`)

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        can_apply: boolean
        status: string
        blockers: Array<{ code: string }>
      }

      expect(body.can_apply).toBe(false)
      expect(body.status).toBe('not_registered')
      expect(body.blockers[0]?.code).toBe('cert_not_registered')
    })

    it('returns already_certified when the wallet is already certified', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request(`/v1/certification/readiness?wallet=${VALID_WALLET}`)

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        can_apply: boolean
        status: string
        requirements: { certification: { active: boolean } }
        links: { certification_status: string }
      }

      expect(body.can_apply).toBe(false)
      expect(body.status).toBe('already_certified')
      expect(body.requirements.certification.active).toBe(true)
      expect(body.links.certification_status).toContain(`/v1/certification/${VALID_WALLET_LOWER}`)
      expect(body.links.certify_overview).toContain(`/certify?wallet=${VALID_WALLET_LOWER}`)
    })
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
      expect((body.links as Record<string, string>).standards_document).toContain(
        `/v1/score/erc8004?wallet=${VALID_WALLET_LOWER}`,
      )
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

    it('rejects API key-only certification requests without x402 payment proof', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)

      const app = createApiKeyAuthenticatedApp()
      const res = await app.request('/v1/certification/apply', {
        method: 'POST',
      })

      expect(res.status).toBe(402)
      const body = (await res.json()) as { error: { code: string; message: string } }
      expect(body.error.code).toBe('payment_required')
      expect(body.error.message).toContain('requires $99 USDC payment via x402')
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
      expect((body.links as Record<string, string>).evaluator_preview).toContain(
        `/v1/score/evaluator?wallet=${VALID_WALLET_LOWER}`,
      )
      expect((body.links as Record<string, string>).certify_readiness).toContain(
        `/certify?wallet=${VALID_WALLET_LOWER}`,
      )
    })

    it('returns 404 cert_not_found for uncertified wallet', async () => {
      const app = createApp()
      const res = await app.request(`/v1/certification/${VALID_WALLET}`)

      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('cert_not_found')
    })
  })

  describe('GET /v1/certification/directory', () => {
    it('returns a public directory of active certifications', async () => {
      seedGoodScore(VALID_WALLET_LOWER)
      seedRegistration(VALID_WALLET_LOWER)
      seedCertification(VALID_WALLET_LOWER)

      const secondWallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      seedGoodScore(secondWallet)
      seedRegistration(secondWallet)
      testDb
        .prepare(`
          INSERT INTO certifications (wallet, tier, score_at_certification, expires_at)
          VALUES (?, 'Elite', 95, datetime('now', '+1 year'))
        `)
        .run(secondWallet)
      testDb
        .prepare(`UPDATE scores SET composite_score = 95, tier = 'Elite', confidence = 0.93 WHERE wallet = ?`)
        .run(secondWallet)

      const app = createApp()
      const res = await app.request('/v1/certification/directory?limit=10')

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        returned: number
        certifications: Array<{
          wallet: string
          certification: { tier: string }
          current_score: { score: number | null; tier: string | null }
          profile: { github_verified: boolean }
          links: { standards_document: string; certify_readiness: string }
        }>
      }

      expect(body.returned).toBe(2)
      expect(body.certifications[0]?.wallet).toBe(secondWallet)
      expect(body.certifications[0]?.certification.tier).toBe('Elite')
      expect(body.certifications[0]?.current_score.score).toBe(95)
      expect(body.certifications[1]?.profile.github_verified).toBe(false)
      expect(body.certifications[1]?.links.standards_document).toContain(
        `/v1/score/erc8004?wallet=${VALID_WALLET_LOWER}`,
      )
      expect(body.certifications[1]?.links.certify_readiness).toContain(`/certify?wallet=${VALID_WALLET_LOWER}`)
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

    it('returns 400 for an invalid wallet badge request', async () => {
      const app = createApp()
      const res = await app.request('/v1/certification/badge/not-a-wallet')

      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Invalid wallet address')
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

  describe('GET /v1/certification/admin/revenue', () => {
    it('returns certification revenue summary with valid admin key', async () => {
      seedCertification(VALID_WALLET_LOWER)

      const app = createApp()
      const res = await app.request('/v1/certification/admin/revenue', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { total_certifications: number; price_per_cert_usd: number }
      expect(body.total_certifications).toBe(1)
      expect(body.price_per_cert_usd).toBe(99)
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

    it('returns 400 for an invalid certification id', async () => {
      const app = createApp()
      const res = await app.request('/v1/certification/admin/not-a-number/revoke', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('invalid_request')
    })
  })
})
