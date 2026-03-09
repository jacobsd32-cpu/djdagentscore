/**
 * Subscription Manager
 *
 * Core billing logic: create Stripe Checkout sessions, provision API keys
 * on successful payment, and handle subscription lifecycle events.
 *
 * All database operations use the synchronous better-sqlite3 driver.
 * Stripe API calls are async, so we follow the "async RPC then sync DB"
 * pattern established elsewhere in the codebase.
 */

import type Database from 'better-sqlite3'
import type Stripe from 'stripe'
import { BILLING_PLANS, type BillingPlan } from '../config/plans.js'
import { db as defaultDb } from '../db.js'
import { log } from '../logger.js'
import { generateApiKey, hashKey, keyPrefix } from '../utils/apiKeyUtils.js'
import { getStripe } from './stripeClient.js'

// ── Checkout Session ──────────────────────────────────────────────

export interface CheckoutResult {
  url: string
  sessionId: string
}

export async function createCheckoutSession(planId: string, email?: string): Promise<CheckoutResult> {
  const plan = BILLING_PLANS[planId]
  if (!plan) throw new Error(`Unknown plan: ${planId}`)

  const stripe = getStripe()

  const baseUrl = process.env.BILLING_BASE_URL ?? 'https://djd-agent-score.fly.dev'

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/docs`,
    metadata: { plan: planId },
  }

  if (email) {
    params.customer_email = email
  }

  const session = await stripe.checkout.sessions.create(params)

  return {
    url: session.url!,
    sessionId: session.id,
  }
}

// ── Key Provisioning ──────────────────────────────────────────────

export interface ProvisionResult {
  apiKeyId: number
  rawKey: string
  plan: string
}

/**
 * Provision an API key for a completed checkout session.
 * Called from the Stripe webhook on `checkout.session.completed`.
 *
 * Idempotent: if a subscription already exists for this session, returns
 * the existing key info without creating a duplicate.
 */
export function provisionApiKey(
  sessionId: string,
  customerId: string,
  subscriptionId: string | null,
  plan: BillingPlan,
  email: string | null,
  db: Database.Database = defaultDb,
): ProvisionResult {
  // Idempotency check — already provisioned?
  const existing = db
    .prepare(
      'SELECT api_key_id, plan FROM subscriptions WHERE stripe_checkout_session_id = ? AND api_key_id IS NOT NULL',
    )
    .get(sessionId) as { api_key_id: number; plan: string } | undefined

  if (existing) {
    log.info('billing', `Checkout already provisioned: ${sessionId}`)
    // We can't return the raw key (it's hashed), but we return the id
    return { apiKeyId: existing.api_key_id, rawKey: '', plan: existing.plan }
  }

  const rawKey = generateApiKey()
  const hash = hashKey(rawKey)
  const prefix = keyPrefix(rawKey)

  // Use a "billing" wallet placeholder — Stripe customers don't have wallets
  const wallet = `stripe:${customerId}`

  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const provision = db.transaction(() => {
    // 1. Insert API key
    const keyResult = db
      .prepare(`
        INSERT INTO api_keys (key_hash, key_prefix, wallet, name, tier, monthly_limit, usage_reset_at, stripe_customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        hash,
        prefix,
        wallet,
        `${plan.name} Plan (${email ?? 'no email'})`,
        plan.id,
        plan.monthlyLimit,
        nextReset.toISOString(),
        customerId,
      )

    const apiKeyId = Number(keyResult.lastInsertRowid)

    // 2. Insert subscription record
    db.prepare(`
      INSERT INTO subscriptions (stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, email, plan, status, api_key_id)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(customerId, subscriptionId, sessionId, email, plan.id, apiKeyId)

    return apiKeyId
  })

  const apiKeyId = provision()

  log.info(
    'billing',
    `API key provisioned: session=${sessionId} customer=${customerId} plan=${plan.id} keyId=${apiKeyId}`,
  )

  return { apiKeyId, rawKey, plan: plan.id }
}

// ── Subscription Lifecycle ────────────────────────────────────────

/**
 * Handle subscription status changes (active, past_due, etc.)
 */
export function handleSubscriptionUpdate(
  subscriptionId: string,
  status: string,
  currentPeriodEnd: string | null,
  db: Database.Database = defaultDb,
): void {
  db.prepare(`
    UPDATE subscriptions
    SET status = ?, current_period_end = ?
    WHERE stripe_subscription_id = ?
  `).run(status, currentPeriodEnd, subscriptionId)

  log.info('billing', `Subscription updated: ${subscriptionId} → ${status}`)
}

/**
 * Handle subscription cancellation — deactivate the API key.
 */
export function handleSubscriptionCanceled(subscriptionId: string, db: Database.Database = defaultDb): void {
  const sub = db.prepare('SELECT api_key_id FROM subscriptions WHERE stripe_subscription_id = ?').get(subscriptionId) as
    | { api_key_id: number | null }
    | undefined

  if (!sub) {
    log.warn('billing', 'Canceled subscription not found', { subscriptionId })
    return
  }

  const cancel = db.transaction(() => {
    // Deactivate API key
    if (sub.api_key_id) {
      db.prepare('UPDATE api_keys SET is_active = 0, revoked_at = datetime("now") WHERE id = ?').run(sub.api_key_id)
    }

    // Mark subscription canceled
    db.prepare(`
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = datetime('now')
      WHERE stripe_subscription_id = ?
    `).run(subscriptionId)
  })

  cancel()

  log.info('billing', `Subscription canceled, key deactivated: ${subscriptionId} keyId=${sub.api_key_id}`)
}

// ── Customer Portal ───────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for self-service management.
 */
export async function createPortalSession(customerId: string): Promise<string> {
  const stripe = getStripe()
  const baseUrl = process.env.BILLING_BASE_URL ?? 'https://djd-agent-score.fly.dev'

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/docs`,
  })

  return session.url
}

// ── Persistent Key Store (Phase 3B) ──────────────────────────────
// Raw API keys are stored in SQLite (encrypted at rest) between webhook
// provisioning and the success page display. Keys auto-expire after 10 min.
// Survives Fly.io restarts — fixes the critical billing bug.

import crypto from 'node:crypto'

const KEY_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getEncryptionKey(): Buffer {
  const adminKey = process.env.ADMIN_KEY ?? 'dev-fallback-key-not-for-production'
  return crypto.createHash('sha256').update(adminKey).digest()
}

function encryptKey(rawKey: string): { encrypted: string; iv: string; authTag: string } {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

function decryptKey(encrypted: string, iv: string, authTag: string): string {
  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return decipher.update(Buffer.from(encrypted, 'base64')) + decipher.final('utf8')
}

export function storePendingKey(sessionId: string, rawKey: string, db: Database.Database = defaultDb): void {
  const { encrypted, iv, authTag } = encryptKey(rawKey)
  const expiresAt = new Date(Date.now() + KEY_TTL_MS).toISOString()
  db.prepare(`
    INSERT OR REPLACE INTO pending_keys (session_id, key_encrypted, iv, auth_tag, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, encrypted, iv, authTag, expiresAt)
  log.info('billing', `Pending key stored for session: ${sessionId}`)
}

/**
 * Retrieve and DELETE the raw key for a session (one-time read).
 * Returns null if expired or already consumed.
 */
export function consumePendingKey(sessionId: string, db: Database.Database = defaultDb): string | null {
  const row = db
    .prepare('SELECT key_encrypted, iv, auth_tag, expires_at FROM pending_keys WHERE session_id = ?')
    .get(sessionId) as { key_encrypted: string; iv: string; auth_tag: string; expires_at: string } | undefined

  if (!row) return null

  // Always delete — one-time read
  db.prepare('DELETE FROM pending_keys WHERE session_id = ?').run(sessionId)

  // Check expiry
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  try {
    return decryptKey(row.key_encrypted, row.iv, row.auth_tag)
  } catch (err) {
    log.error('billing', 'Failed to decrypt pending key', err)
    return null
  }
}

/** Cleanup expired pending keys — called from dataPruner job. */
export function pruneExpiredPendingKeys(db: Database.Database = defaultDb): number {
  const result = db.prepare("DELETE FROM pending_keys WHERE expires_at < datetime('now')").run()
  return result.changes
}

// ── Lookup Helpers ────────────────────────────────────────────────

/**
 * Get the raw API key for a checkout session that was just completed.
 * Returns null if the session hasn't been provisioned yet.
 *
 * Note: This reads from a temporary store. After first retrieval on the
 * success page, the key cannot be recovered (only the hash is in the DB).
 */
export function getSubscriptionBySessionId(
  sessionId: string,
  db: Database.Database = defaultDb,
): { plan: string; apiKeyId: number; status: string } | null {
  const row = db
    .prepare('SELECT plan, api_key_id, status FROM subscriptions WHERE stripe_checkout_session_id = ?')
    .get(sessionId) as { plan: string; api_key_id: number; status: string } | undefined

  return row ? { plan: row.plan, apiKeyId: row.api_key_id, status: row.status } : null
}
