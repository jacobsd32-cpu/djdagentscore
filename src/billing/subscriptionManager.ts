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
import crypto from 'node:crypto'
import {
  cancelSubscription,
  findProvisionedSubscriptionBySessionId,
  findSubscriptionBySessionId,
  insertProvisionedSubscription,
  pruneExpiredPendingKeyRecords,
  storePendingKeyRecord,
  consumePendingKeyRecord,
  updateSubscriptionStatus,
} from './billingStore.js'
import { BILLING_PLANS, type BillingPlan } from '../config/plans.js'
import { getPublicBaseUrl } from '../config/public.js'
import { db as defaultDb } from '../db.js'
import { log } from '../logger.js'
import { prepareApiKeyProvisioning } from '../services/apiKeyService.js'
import { trackGrowthEventSafe } from '../services/growthService.js'
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

  const baseUrl = getPublicBaseUrl()

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
  const existing = findProvisionedSubscriptionBySessionId(db, sessionId)

  if (existing) {
    log.info('billing', `Checkout already provisioned: ${sessionId}`)
    // We can't return the raw key (it's hashed), but we return the id
    return { apiKeyId: existing.api_key_id, rawKey: '', plan: existing.plan }
  }

  // Use a "billing" wallet placeholder — Stripe customers don't have wallets
  const wallet = `stripe:${customerId}`
  const provisioned = prepareApiKeyProvisioning({
    wallet,
    name: `${plan.name} Plan (${email ?? 'no email'})`,
    tier: plan.id,
    monthlyLimit: plan.monthlyLimit,
    stripeCustomerId: customerId,
  })

  const apiKeyId = insertProvisionedSubscription(db, {
    apiKey: provisioned.insertInput,
    subscription: {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: sessionId,
      email,
      plan: plan.id,
    },
  })

  log.info(
    'billing',
    `API key provisioned: session=${sessionId} customer=${customerId} plan=${plan.id} keyId=${apiKeyId}`,
  )

  trackGrowthEventSafe({
    event: 'api_key_created',
    source: 'server',
    page: '/billing/success',
    metadata: {
      tier: plan.id,
      monthlyLimit: plan.monthlyLimit,
      source: 'stripe',
      customerId,
    },
  })

  return { apiKeyId, rawKey: provisioned.rawKey, plan: plan.id }
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
  updateSubscriptionStatus(db, subscriptionId, status, currentPeriodEnd)

  log.info('billing', `Subscription updated: ${subscriptionId} → ${status}`)
}

/**
 * Handle subscription cancellation — deactivate the API key.
 */
export function handleSubscriptionCanceled(subscriptionId: string, db: Database.Database = defaultDb): void {
  const result = cancelSubscription(db, subscriptionId)
  if (!result.found) {
    log.warn('billing', 'Canceled subscription not found', { subscriptionId })
    return
  }

  log.info('billing', `Subscription canceled, key deactivated: ${subscriptionId} keyId=${result.apiKeyId}`)
}

// ── Customer Portal ───────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for self-service management.
 */
export async function createPortalSession(customerId: string): Promise<string> {
  const stripe = getStripe()
  const baseUrl = getPublicBaseUrl()

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
  storePendingKeyRecord(db, sessionId, encrypted, iv, authTag, expiresAt)
  log.info('billing', `Pending key stored for session: ${sessionId}`)
}

/**
 * Retrieve and DELETE the raw key for a session (one-time read).
 * Returns null if expired or already consumed.
 */
export function consumePendingKey(sessionId: string, db: Database.Database = defaultDb): string | null {
  const row = consumePendingKeyRecord(db, sessionId)
  if (!row) return null

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
  return pruneExpiredPendingKeyRecords(db)
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
): { plan: string; apiKeyId: number | null; status: string; stripe_customer_id: string } | null {
  const row = findSubscriptionBySessionId(db, sessionId)
  return row
    ? {
        plan: row.plan,
        apiKeyId: row.api_key_id,
        status: row.status,
        stripe_customer_id: row.stripe_customer_id,
      }
    : null
}
