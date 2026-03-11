import { beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678'
const VALID_WALLET_LOWER = VALID_WALLET.toLowerCase()

const { queueWebhookEventMock, testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registrations (
      wallet TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      github_url TEXT,
      website_url TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      github_verified INTEGER NOT NULL DEFAULT 0,
      github_stars INTEGER,
      github_pushed_at TEXT,
      github_verified_at TEXT
    );
  `)
  return { queueWebhookEventMock: vi.fn(), testDb: db }
})

vi.mock('../../src/db.js', () => ({
  getRegistration: (wallet: string) =>
    testDb.prepare('SELECT * FROM agent_registrations WHERE wallet = ? LIMIT 1').get(wallet),
  upsertRegistration: (reg: {
    wallet: string
    name: string | null
    description: string | null
    github_url: string | null
    website_url: string | null
  }) =>
    testDb.prepare(
      `INSERT INTO agent_registrations (wallet, name, description, github_url, website_url, registered_at, updated_at)
       VALUES (@wallet, @name, @description, @github_url, @website_url, datetime('now'), datetime('now'))
       ON CONFLICT(wallet) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         github_url = excluded.github_url,
         website_url = excluded.website_url,
         updated_at = datetime('now')`,
    ).run(reg),
  updateGithubVerification: (wallet: string, verified: boolean, stars: number | null, pushedAt: string | null) =>
    testDb.prepare(
      `UPDATE agent_registrations
       SET github_verified = ?, github_stars = ?, github_pushed_at = ?, github_verified_at = datetime('now')
       WHERE wallet = ?`,
    ).run(verified ? 1 : 0, stars, pushedAt, wallet),
  getAllRegistrationsWithGithub: () =>
    testDb.prepare('SELECT * FROM agent_registrations WHERE github_url IS NOT NULL').all(),
}))

vi.mock('../../src/jobs/webhookDelivery.js', () => ({
  queueWebhookEvent: queueWebhookEventMock,
}))

import { Hono } from 'hono'
import registerRoute from '../../src/routes/register.js'

function createApp() {
  const app = new Hono()
  app.route('/v1/agent/register', registerRoute)
  return app
}

describe('Register routes', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM agent_registrations')
    queueWebhookEventMock.mockReset()
  })

  it('returns 404 for unregistered wallet lookup', async () => {
    const app = createApp()
    const res = await app.request(`/v1/agent/register?wallet=${VALID_WALLET}`)

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('wallet_not_found')
  })

  it('registers a wallet and queues the registration webhook', async () => {
    const app = createApp()
    const res = await app.request('/v1/agent/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: VALID_WALLET,
        name: 'Test Agent',
        description: 'Does useful work',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.status).toBe('registered')
    expect(body.name).toBe('Test Agent')
    expect(queueWebhookEventMock).toHaveBeenCalledWith(
      'agent.registered',
      expect.objectContaining({
        wallet: VALID_WALLET_LOWER,
        status: 'registered',
        name: 'Test Agent',
      }),
    )
  })

  it('returns registration details after a wallet has been registered', async () => {
    testDb
      .prepare(
        `INSERT INTO agent_registrations
         (wallet, name, description, github_url, website_url, github_verified, github_stars, github_pushed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        VALID_WALLET_LOWER,
        'Stored Agent',
        'Stored description',
        'https://github.com/example/repo',
        'https://example.com',
        1,
        42,
        '2026-03-01T00:00:00.000Z',
      )

    const app = createApp()
    const res = await app.request(`/v1/agent/register?wallet=${VALID_WALLET}`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.wallet).toBe(VALID_WALLET_LOWER)
    expect(body.status).toBe('registered')
    expect(body.github_verified).toBe(true)
    expect(body.github_stars).toBe(42)
  })

  it('rejects invalid github_url values', async () => {
    const app = createApp()
    const res = await app.request('/v1/agent/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: VALID_WALLET,
        github_url: 'http://github.com/example/repo',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_registration')
  })
})
