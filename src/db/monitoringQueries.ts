import { db } from './connection.js'

export interface MonitoringSubscriptionRow {
  id: string
  subscriber_wallet: string
  target_wallet: string
  webhook_id: number
  policy_type: string
  is_active: number
  created_at: string
  disabled_at: string | null
  url: string
  events: string
  threshold_score: number | null
  forensics_min_risk_level: string | null
  forensics_report_reasons: string | null
  failure_count: number
  last_delivery_at: string | null
  webhook_is_active: number
  webhook_disabled_at: string | null
}

const stmtInsertMonitoringSubscription = db.prepare<[string, string, string, number, string]>(`
  INSERT INTO monitoring_subscriptions (
    id,
    subscriber_wallet,
    target_wallet,
    webhook_id,
    policy_type
  )
  VALUES (?, ?, ?, ?, ?)
`)

const MONITORING_SELECT = `
  SELECT
    ms.id,
    ms.subscriber_wallet,
    ms.target_wallet,
    ms.webhook_id,
    ms.policy_type,
    ms.is_active,
    ms.created_at,
    ms.disabled_at,
    w.url,
    w.events,
    w.threshold_score,
    w.forensics_min_risk_level,
    w.forensics_report_reasons,
    w.failure_count,
    w.last_delivery_at,
    w.is_active as webhook_is_active,
    w.disabled_at as webhook_disabled_at
  FROM monitoring_subscriptions ms
  JOIN webhooks w ON w.id = ms.webhook_id
`

const stmtListMonitoringSubscriptionsBySubscriber = db.prepare<[string], MonitoringSubscriptionRow>(`
  ${MONITORING_SELECT}
  WHERE ms.subscriber_wallet = ?
  ORDER BY ms.created_at DESC
`)

const stmtGetMonitoringSubscriptionByIdForSubscriber = db.prepare<[string, string], MonitoringSubscriptionRow>(`
  ${MONITORING_SELECT}
  WHERE ms.id = ? AND ms.subscriber_wallet = ?
  LIMIT 1
`)

const stmtDeactivateMonitoringSubscriptionForSubscriber = db.prepare(`
  UPDATE monitoring_subscriptions
  SET is_active = 0, disabled_at = datetime('now')
  WHERE id = ? AND subscriber_wallet = ? AND is_active = 1
`)

const stmtCountActiveMonitoringSubscriptionsBySubscriber = db.prepare<[string], { count: number }>(`
  SELECT COUNT(*) as count
  FROM monitoring_subscriptions ms
  JOIN webhooks w ON w.id = ms.webhook_id
  WHERE ms.subscriber_wallet = ?
    AND ms.is_active = 1
    AND w.is_active = 1
`)

export function insertMonitoringSubscription(input: {
  id: string
  subscriber_wallet: string
  target_wallet: string
  webhook_id: number
  policy_type: string
}): void {
  stmtInsertMonitoringSubscription.run(
    input.id,
    input.subscriber_wallet,
    input.target_wallet,
    input.webhook_id,
    input.policy_type,
  )
}

export function listMonitoringSubscriptionsBySubscriber(subscriberWallet: string): MonitoringSubscriptionRow[] {
  return stmtListMonitoringSubscriptionsBySubscriber.all(subscriberWallet)
}

export function getMonitoringSubscriptionByIdForSubscriber(
  id: string,
  subscriberWallet: string,
): MonitoringSubscriptionRow | undefined {
  return stmtGetMonitoringSubscriptionByIdForSubscriber.get(id, subscriberWallet)
}

export function deactivateMonitoringSubscriptionForSubscriber(id: string, subscriberWallet: string): boolean {
  return stmtDeactivateMonitoringSubscriptionForSubscriber.run(id, subscriberWallet).changes > 0
}

export function countActiveMonitoringSubscriptionsBySubscriber(subscriberWallet: string): number {
  return stmtCountActiveMonitoringSubscriptionsBySubscriber.get(subscriberWallet)?.count ?? 0
}
