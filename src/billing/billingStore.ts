import type Database from 'better-sqlite3'

export interface ProvisionedSubscriptionRow {
  api_key_id: number
  plan: string
}

export interface PendingKeyRow {
  key_encrypted: string
  iv: string
  auth_tag: string
  expires_at: string
}

export interface SubscriptionSessionRow {
  plan: string
  api_key_id: number | null
  status: string
}

export interface CancelSubscriptionResult {
  found: boolean
  apiKeyId: number | null
}

export function findProvisionedSubscriptionBySessionId(
  db: Database.Database,
  sessionId: string,
): ProvisionedSubscriptionRow | undefined {
  return db
    .prepare(
      'SELECT api_key_id, plan FROM subscriptions WHERE stripe_checkout_session_id = ? AND api_key_id IS NOT NULL',
    )
    .get(sessionId) as ProvisionedSubscriptionRow | undefined
}

export function insertProvisionedSubscription(
  db: Database.Database,
  input: {
    apiKey: {
      key_hash: string
      key_prefix: string
      wallet: string
      name: string | null
      tier: string
      monthly_limit: number
      usage_reset_at: string
      stripe_customer_id?: string | null
    }
    subscription: {
      stripe_customer_id: string
      stripe_subscription_id: string | null
      stripe_checkout_session_id: string
      email: string | null
      plan: string
    }
  },
): number {
  const runProvision = db.transaction(() => {
    const keyResult = db
      .prepare(`
        INSERT INTO api_keys (key_hash, key_prefix, wallet, name, tier, monthly_limit, usage_reset_at, stripe_customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.apiKey.key_hash,
        input.apiKey.key_prefix,
        input.apiKey.wallet,
        input.apiKey.name,
        input.apiKey.tier,
        input.apiKey.monthly_limit,
        input.apiKey.usage_reset_at,
        input.apiKey.stripe_customer_id ?? null,
      )

    const apiKeyId = Number(keyResult.lastInsertRowid)

    db.prepare(`
      INSERT INTO subscriptions (stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, email, plan, status, api_key_id)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(
      input.subscription.stripe_customer_id,
      input.subscription.stripe_subscription_id,
      input.subscription.stripe_checkout_session_id,
      input.subscription.email,
      input.subscription.plan,
      apiKeyId,
    )

    return apiKeyId
  })

  return runProvision()
}

export function updateSubscriptionStatus(
  db: Database.Database,
  subscriptionId: string,
  status: string,
  currentPeriodEnd: string | null,
): void {
  db.prepare(`
    UPDATE subscriptions
    SET status = ?, current_period_end = ?
    WHERE stripe_subscription_id = ?
  `).run(status, currentPeriodEnd, subscriptionId)
}

export function cancelSubscription(db: Database.Database, subscriptionId: string): CancelSubscriptionResult {
  const subscription = db.prepare('SELECT api_key_id FROM subscriptions WHERE stripe_subscription_id = ?').get(subscriptionId) as
    | { api_key_id: number | null }
    | undefined

  if (!subscription) {
    return { found: false, apiKeyId: null }
  }

  const runCancel = db.transaction(() => {
    if (subscription.api_key_id) {
      db.prepare("UPDATE api_keys SET is_active = 0, revoked_at = datetime('now') WHERE id = ?").run(
        subscription.api_key_id,
      )
    }

    db.prepare(`
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = datetime('now')
      WHERE stripe_subscription_id = ?
    `).run(subscriptionId)
  })

  runCancel()
  return { found: true, apiKeyId: subscription.api_key_id ?? null }
}

export function storePendingKeyRecord(
  db: Database.Database,
  sessionId: string,
  encrypted: string,
  iv: string,
  authTag: string,
  expiresAt: string,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO pending_keys (session_id, key_encrypted, iv, auth_tag, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, encrypted, iv, authTag, expiresAt)
}

export function consumePendingKeyRecord(db: Database.Database, sessionId: string): PendingKeyRow | undefined {
  const row = db
    .prepare('SELECT key_encrypted, iv, auth_tag, expires_at FROM pending_keys WHERE session_id = ?')
    .get(sessionId) as PendingKeyRow | undefined

  if (!row) return undefined

  db.prepare('DELETE FROM pending_keys WHERE session_id = ?').run(sessionId)
  return row
}

export function pruneExpiredPendingKeyRecords(db: Database.Database): number {
  return db.prepare("DELETE FROM pending_keys WHERE expires_at < datetime('now')").run().changes
}

export function findSubscriptionBySessionId(
  db: Database.Database,
  sessionId: string,
): SubscriptionSessionRow | undefined {
  return db
    .prepare('SELECT plan, api_key_id, status FROM subscriptions WHERE stripe_checkout_session_id = ?')
    .get(sessionId) as SubscriptionSessionRow | undefined
}
