import { v4 as uuidv4 } from 'uuid'

import {
  countActiveMonitoringSubscriptionsBySubscriber,
  deactivateMonitoringSubscriptionForSubscriber,
  getMonitoringSubscriptionByIdForSubscriber,
  insertMonitoringSubscription,
  listMonitoringSubscriptionsBySubscriber,
} from '../db.js'
import { ErrorCodes } from '../errors.js'
import type { ReportReason } from '../types.js'
import { normalizeWallet } from '../utils/walletUtils.js'
import {
  createManagedWebhook,
  deactivateAdminWebhook,
  WEBHOOK_PRESETS,
  type WebhookForensicsFilter,
  type WebhookPresetName,
  type WebhookRecord,
} from './webhookService.js'

const MAX_MONITORING_SUBSCRIPTIONS_PER_SUBSCRIBER = 25
const MONITORING_POLICY_TYPES = Object.keys(WEBHOOK_PRESETS) as WebhookPresetName[]

interface MonitoringServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 401 | 404 | 429 | 500
  details?: Record<string, unknown>
}

interface MonitoringServiceSuccess<T> {
  ok: true
  data: T
  status?: 201
}

type MonitoringServiceResult<T> = MonitoringServiceError | MonitoringServiceSuccess<T>

interface MonitoringSubscriptionView {
  id: string
  target_wallet: string
  policy_type: WebhookPresetName
  url: string
  events: string[]
  threshold_score: number | null
  forensics_filter: WebhookForensicsFilter | null
  is_active: boolean
  created_at: string
  disabled_at: string | null
  failure_count: number
  last_delivery_at: string | null
}

interface MonitoringCreateView extends MonitoringSubscriptionView {
  secret: string
  presets_applied: string[]
  message: string
}

interface MonitoringListView {
  subscriptions: MonitoringSubscriptionView[]
  count: number
}

interface MonitoringPresetView {
  policy_type: WebhookPresetName
  description: string
  events: string[]
  threshold_score_default: number | null
  supports_threshold_score: boolean
  supports_forensics_filter: boolean
}

function invalidMonitoringError(message: string, details?: Record<string, unknown>): MonitoringServiceError {
  return {
    ok: false,
    code: ErrorCodes.MONITORING_INVALID,
    message,
    status: 400,
    ...(details ? { details } : {}),
  }
}

function normalizeMonitoringWebhook(
  webhook: WebhookRecord,
  id: string,
  policyType: WebhookPresetName,
): MonitoringSubscriptionView {
  return {
    id,
    target_wallet: webhook.wallet,
    policy_type: policyType,
    url: webhook.url,
    events: webhook.events,
    threshold_score: webhook.threshold_score ?? null,
    forensics_filter: webhook.forensics_filter ?? null,
    is_active: webhook.is_active === 1,
    created_at: webhook.created_at,
    disabled_at: webhook.disabled_at ?? null,
    failure_count: webhook.failure_count,
    last_delivery_at: webhook.last_delivery_at ?? null,
  }
}

function parsePolicyType(rawPolicyType: unknown): WebhookPresetName | null {
  return typeof rawPolicyType === 'string' && MONITORING_POLICY_TYPES.includes(rawPolicyType as WebhookPresetName)
    ? (rawPolicyType as WebhookPresetName)
    : null
}

function parseTargetWallet(subscriberWallet: string, rawTargetWallet: unknown): string | MonitoringServiceError {
  if (rawTargetWallet === undefined || rawTargetWallet === null || rawTargetWallet === '') {
    return subscriberWallet
  }

  if (typeof rawTargetWallet !== 'string') {
    return invalidMonitoringError('target_wallet must be a wallet address')
  }

  const normalizedTarget = normalizeWallet(rawTargetWallet)
  if (!normalizedTarget) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_WALLET,
      message: 'Invalid target_wallet',
      status: 400,
    }
  }

  return normalizedTarget
}

function isMonitoringServiceError<T>(value: T | MonitoringServiceError): value is MonitoringServiceError {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}

function buildMonitoringWebhookInput(body: Record<string, unknown>, policyType: WebhookPresetName) {
  return {
    url: body.url,
    preset: policyType,
    ...(body.threshold_score !== undefined ? { threshold_score: body.threshold_score } : {}),
    ...(body.forensics_filter !== undefined ? { forensics_filter: body.forensics_filter } : {}),
  }
}

function toMonitoringSubscriptionView(row: {
  id: string
  target_wallet: string
  policy_type: string
  created_at: string
  disabled_at: string | null
  url: string
  events: string
  threshold_score: number | null
  forensics_min_risk_level: string | null
  forensics_report_reasons: string | null
  failure_count: number
  last_delivery_at: string | null
  is_active: number
  webhook_is_active: number
  webhook_disabled_at: string | null
}): MonitoringSubscriptionView {
  const reasons =
    row.forensics_report_reasons !== null ? (JSON.parse(row.forensics_report_reasons) as ReportReason[]) : null

  return {
    id: row.id,
    target_wallet: row.target_wallet,
    policy_type: row.policy_type as WebhookPresetName,
    url: row.url,
    events: JSON.parse(row.events) as string[],
    threshold_score: row.threshold_score,
    forensics_filter:
      row.forensics_min_risk_level || reasons
        ? {
            ...(row.forensics_min_risk_level
              ? { minimum_risk_level: row.forensics_min_risk_level as WebhookForensicsFilter['minimum_risk_level'] }
              : {}),
            ...(reasons ? { reasons } : {}),
          }
        : null,
    is_active: row.is_active === 1 && row.webhook_is_active === 1,
    created_at: row.created_at,
    disabled_at: row.disabled_at ?? row.webhook_disabled_at ?? null,
    failure_count: row.failure_count,
    last_delivery_at: row.last_delivery_at,
  }
}

export function listMonitoringPolicyPresets(): MonitoringPresetView[] {
  return MONITORING_POLICY_TYPES.map((policyType) => {
    const preset = WEBHOOK_PRESETS[policyType]
    return {
      policy_type: policyType,
      description: preset.description,
      events: [...preset.events],
      threshold_score_default: preset.defaultThresholdScore ?? null,
      supports_threshold_score: preset.events.includes('score.threshold'),
      supports_forensics_filter: preset.events.some(
        (event) => event.startsWith('fraud.') || event.startsWith('forensics.'),
      ),
    }
  })
}

export function createMonitoringSubscription(
  subscriberWallet: string | null | undefined,
  body: unknown,
): MonitoringServiceResult<MonitoringCreateView> {
  const normalizedSubscriber = normalizeWallet(subscriberWallet)
  if (!normalizedSubscriber) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'API key required to manage monitoring subscriptions',
      status: 401,
    }
  }

  if (
    countActiveMonitoringSubscriptionsBySubscriber(normalizedSubscriber) >= MAX_MONITORING_SUBSCRIPTIONS_PER_SUBSCRIBER
  ) {
    return {
      ok: false,
      code: ErrorCodes.MONITORING_LIMIT_EXCEEDED,
      message: `Maximum ${MAX_MONITORING_SUBSCRIPTIONS_PER_SUBSCRIBER} active monitoring subscriptions per subscriber`,
      status: 429,
    }
  }

  if (typeof body !== 'object' || body === null) {
    return invalidMonitoringError('url and policy_type are required')
  }

  const record = body as Record<string, unknown>
  if (typeof record.url !== 'string' || record.url.trim().length === 0) {
    return invalidMonitoringError('url and policy_type are required')
  }

  const policyType = parsePolicyType(record.policy_type)
  if (!policyType) {
    return invalidMonitoringError(`policy_type must be one of: ${MONITORING_POLICY_TYPES.join(', ')}`)
  }

  const targetWallet = parseTargetWallet(normalizedSubscriber, record.target_wallet)
  if (isMonitoringServiceError(targetWallet)) return targetWallet

  const webhookResult = createManagedWebhook(targetWallet, buildMonitoringWebhookInput(record, policyType))
  if (!webhookResult.ok) {
    return webhookResult
  }

  const subscriptionId = uuidv4()

  try {
    insertMonitoringSubscription({
      id: subscriptionId,
      subscriber_wallet: normalizedSubscriber,
      target_wallet: targetWallet,
      webhook_id: webhookResult.webhook.id,
      policy_type: policyType,
    })
  } catch (err) {
    deactivateAdminWebhook(webhookResult.webhook.id)
    return {
      ok: false,
      code: ErrorCodes.INTERNAL_ERROR,
      message: `Failed to create monitoring subscription: ${(err as Error).message}`,
      status: 500,
    }
  }

  const baseView = normalizeMonitoringWebhook(webhookResult.webhook, subscriptionId, policyType)
  return {
    ok: true,
    status: 201,
    data: {
      ...baseView,
      secret: webhookResult.webhook.secret,
      presets_applied: webhookResult.presetsApplied,
      message: webhookResult.message,
    },
  }
}

export function listMonitoringSubscriptions(
  subscriberWallet: string | null | undefined,
): MonitoringServiceResult<MonitoringListView> {
  const normalizedSubscriber = normalizeWallet(subscriberWallet)
  if (!normalizedSubscriber) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'API key required to manage monitoring subscriptions',
      status: 401,
    }
  }

  const subscriptions = listMonitoringSubscriptionsBySubscriber(normalizedSubscriber).map(toMonitoringSubscriptionView)
  return {
    ok: true,
    data: {
      subscriptions,
      count: subscriptions.length,
    },
  }
}

export function deactivateMonitoringSubscription(
  subscriberWallet: string | null | undefined,
  id: string,
): MonitoringServiceResult<{ success: true }> {
  const normalizedSubscriber = normalizeWallet(subscriberWallet)
  if (!normalizedSubscriber) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'API key required to manage monitoring subscriptions',
      status: 401,
    }
  }

  const subscription = getMonitoringSubscriptionByIdForSubscriber(id, normalizedSubscriber)
  if (!subscription || subscription.is_active !== 1) {
    return {
      ok: false,
      code: ErrorCodes.MONITORING_NOT_FOUND,
      message: 'Monitoring subscription not found or already disabled',
      status: 404,
    }
  }

  if (!deactivateMonitoringSubscriptionForSubscriber(id, normalizedSubscriber)) {
    return {
      ok: false,
      code: ErrorCodes.MONITORING_NOT_FOUND,
      message: 'Monitoring subscription not found or already disabled',
      status: 404,
    }
  }

  deactivateAdminWebhook(subscription.webhook_id)

  return {
    ok: true,
    data: { success: true },
  }
}
