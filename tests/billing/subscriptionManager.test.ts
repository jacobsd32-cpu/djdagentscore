import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BillingPlan } from '../../src/config/plans.js'

vi.mock('../../src/billing/stripeClient.js', () => ({
  getStripe: vi.fn(),
}))

vi.mock('../../src/db.js', () => ({
  db: {},
  insertApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
  resetApiKeyUsage: vi.fn(),
}))

import {
  consumePendingKey,
  getSubscriptionBySessionId,
  handleSubscriptionCanceled,
  provisionApiKey,
  pruneExpiredPendingKeys,
  storePendingKey,
} from '../../src/billing/subscriptionManager.js'
import { createTestDb } from '../helpers/testDb.js'

const PLAN: BillingPlan = {
  id: 'growth',
  name: 'Growth',
  monthlyPrice: 79,
  monthlyLimit: 5000,
  stripePriceId: 'price_growth',
}

describe('subscriptionManager', () => {
  let db = createTestDb()

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('provisions an API key and subscription record', () => {
    const result = provisionApiKey('cs_test_1', 'cus_123', 'sub_123', PLAN, 'owner@example.com', db)

    expect(result.apiKeyId).toBeGreaterThan(0)
    expect(result.rawKey.startsWith('djd_live_')).toBe(true)
    expect(result.plan).toBe('growth')

    const apiKey = db
      .prepare('SELECT wallet, name, tier, monthly_limit, stripe_customer_id FROM api_keys WHERE id = ?')
      .get(result.apiKeyId) as {
      wallet: string
      name: string
      tier: string
      monthly_limit: number
      stripe_customer_id: string
    }

    expect(apiKey.wallet).toBe('stripe:cus_123')
    expect(apiKey.name).toContain('Growth Plan')
    expect(apiKey.tier).toBe('growth')
    expect(apiKey.monthly_limit).toBe(5000)
    expect(apiKey.stripe_customer_id).toBe('cus_123')

    expect(getSubscriptionBySessionId('cs_test_1', db)).toEqual({
      plan: 'growth',
      apiKeyId: result.apiKeyId,
      status: 'active',
    })
  })

  it('is idempotent for an already provisioned checkout session', () => {
    const first = provisionApiKey('cs_test_1', 'cus_123', 'sub_123', PLAN, 'owner@example.com', db)
    const second = provisionApiKey('cs_test_1', 'cus_123', 'sub_123', PLAN, 'owner@example.com', db)

    expect(second.apiKeyId).toBe(first.apiKeyId)
    expect(second.rawKey).toBe('')

    const counts = db
      .prepare('SELECT (SELECT COUNT(*) FROM api_keys) as api_keys, (SELECT COUNT(*) FROM subscriptions) as subscriptions')
      .get() as { api_keys: number; subscriptions: number }

    expect(counts.api_keys).toBe(1)
    expect(counts.subscriptions).toBe(1)
  })

  it('cancels a subscription and deactivates the associated API key', () => {
    const provisioned = provisionApiKey('cs_test_1', 'cus_123', 'sub_123', PLAN, 'owner@example.com', db)

    handleSubscriptionCanceled('sub_123', db)

    const apiKey = db
      .prepare('SELECT is_active, revoked_at FROM api_keys WHERE id = ?')
      .get(provisioned.apiKeyId) as { is_active: number; revoked_at: string | null }
    expect(apiKey.is_active).toBe(0)
    expect(apiKey.revoked_at).toBeTruthy()

    const subscription = db
      .prepare('SELECT status, canceled_at FROM subscriptions WHERE stripe_subscription_id = ?')
      .get('sub_123') as { status: string; canceled_at: string | null }
    expect(subscription.status).toBe('canceled')
    expect(subscription.canceled_at).toBeTruthy()
  })

  it('stores and consumes pending keys exactly once', () => {
    storePendingKey('cs_pending_1', 'djd_live_pending_key', db)

    expect(consumePendingKey('cs_pending_1', db)).toBe('djd_live_pending_key')
    expect(consumePendingKey('cs_pending_1', db)).toBeNull()
  })

  it('prunes expired pending keys', () => {
    db.prepare(`
      INSERT INTO pending_keys (session_id, key_encrypted, iv, auth_tag, expires_at)
      VALUES
        ('expired', 'enc', 'iv', 'tag', datetime('now', '-1 hour')),
        ('fresh', 'enc2', 'iv2', 'tag2', datetime('now', '+1 hour'))
    `).run()

    const deleted = pruneExpiredPendingKeys(db)
    expect(deleted).toBe(1)

    const rows = db.prepare('SELECT session_id FROM pending_keys ORDER BY session_id').all() as Array<{ session_id: string }>
    expect(rows).toEqual([{ session_id: 'fresh' }])
  })
})
