import crypto from 'node:crypto'

import {
  countActiveWebhooksForWallet,
  deactivateWebhook,
  deactivateWebhookForWallet,
  getWebhookById,
  insertWebhook,
  listRecentWebhookDeliveries,
  listWebhooks,
  listWebhooksForWallet,
} from '../db.js'
import type { WebhookDeliveryRow, WebhookRow } from '../db.js'
import { isValidWebhookUrl } from '../types.js'

export const VALID_WEBHOOK_EVENTS = [
  'score.updated',
  'score.expired',
  'fraud.reported',
  'agent.registered',
  'score.threshold',
]

export const MAX_WEBHOOKS_PER_WALLET = 10

const WEBHOOK_SECRET_NOTICE = 'Store the secret securely — used to verify webhook signatures.'

type WebhookErrorStatus = 400 | 404 | 429

interface WebhookCreateInput {
  wallet: string
  url: string
  secret: string
  events: string[]
  tier: string
}

export interface WebhookServiceError {
  ok: false
  code: 'webhook_invalid' | 'webhook_url_invalid' | 'webhook_limit_exceeded' | 'webhook_not_found'
  message: string
  status: WebhookErrorStatus
}

export interface WebhookRecord {
  id: number
  wallet: string
  url: string
  secret: string
  events: string[]
  tier: string
  is_active: number
  created_at: string
  failure_count: number
  last_delivery_at: string | null
  disabled_at: string | null
  threshold_score?: number | null
}

export interface WebhookDetail extends WebhookRecord {
  recent_deliveries: WebhookDeliveryRow[]
}

export interface WebhookMutationSuccess {
  ok: true
  webhook: WebhookRecord
  message: string
}

export interface WebhookTestSuccess {
  ok: true
  success: boolean
  statusCode: number | null
  message: string
}

export type WebhookMutationResult = WebhookServiceError | WebhookMutationSuccess
export type WebhookTestResult = WebhookServiceError | WebhookTestSuccess

function isWebhookServiceError(value: WebhookCreateInput | WebhookServiceError): value is WebhookServiceError {
  return 'ok' in value && value.ok === false
}

function parseWebhookEvents(events: string): string[] {
  return JSON.parse(events) as string[]
}

function normalizeWebhookRecord(row: WebhookRow): WebhookRecord {
  return {
    ...row,
    events: parseWebhookEvents(row.events),
  }
}

function invalidWebhookError(message: string): WebhookServiceError {
  return {
    ok: false,
    code: 'webhook_invalid',
    message,
    status: 400,
  }
}

function invalidWebhookUrlError(message: string): WebhookServiceError {
  return {
    ok: false,
    code: 'webhook_url_invalid',
    message,
    status: 400,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getTier(rawTier: unknown, fallback: string): string {
  return typeof rawTier === 'string' && rawTier.trim() ? rawTier : fallback
}

function validateWebhookEvents(events: unknown): string[] | null {
  if (!Array.isArray(events) || events.length === 0) return null
  if (!events.every((event): event is string => typeof event === 'string' && VALID_WEBHOOK_EVENTS.includes(event))) {
    return null
  }
  return events
}

function parseAdminCreateInput(body: unknown): WebhookCreateInput | WebhookServiceError {
  if (!isRecord(body) || !body.wallet || !body.url || !body.events) {
    return invalidWebhookError('wallet, url, and events[] are required')
  }

  if (typeof body.wallet !== 'string') {
    return invalidWebhookError('wallet, url, and events[] are required')
  }

  if (typeof body.url !== 'string' || !isValidWebhookUrl(body.url)) {
    return invalidWebhookUrlError('Invalid webhook URL: must be HTTPS and not target internal networks')
  }

  const events = validateWebhookEvents(body.events)
  if (!events) {
    return invalidWebhookError(`Invalid events. Valid: ${VALID_WEBHOOK_EVENTS.join(', ')}`)
  }

  return {
    wallet: body.wallet.toLowerCase(),
    url: body.url,
    secret: crypto.randomBytes(32).toString('hex'),
    events,
    tier: getTier(body.tier, 'basic'),
  }
}

function parsePublicCreateInput(wallet: string, body: unknown): WebhookCreateInput | WebhookServiceError {
  if (!isRecord(body) || !body.url || !body.events) {
    return invalidWebhookError('url and events[] are required')
  }

  if (typeof body.url !== 'string' || !isValidWebhookUrl(body.url)) {
    return invalidWebhookUrlError('Invalid webhook URL: must be HTTPS and not target internal networks')
  }

  const events = validateWebhookEvents(body.events)
  if (!events) {
    return invalidWebhookError(`Invalid events. Valid: ${VALID_WEBHOOK_EVENTS.join(', ')}`)
  }

  return {
    wallet: wallet.toLowerCase(),
    url: body.url,
    secret: crypto.randomBytes(32).toString('hex'),
    events,
    tier: 'basic',
  }
}

export function createAdminWebhook(body: unknown): WebhookMutationResult {
  const parsed = parseAdminCreateInput(body)
  if (isWebhookServiceError(parsed)) return parsed

  const webhook = insertWebhook(parsed)

  return {
    ok: true,
    webhook: normalizeWebhookRecord(webhook),
    message: WEBHOOK_SECRET_NOTICE,
  }
}

export function listAdminWebhooks(): WebhookRecord[] {
  return listWebhooks().map(normalizeWebhookRecord)
}

export function getWebhookDetail(id: number): WebhookDetail | null {
  const webhook = getWebhookById(id)
  if (!webhook) return null

  return {
    ...normalizeWebhookRecord(webhook),
    recent_deliveries: listRecentWebhookDeliveries(id),
  }
}

export function deactivateAdminWebhook(id: number): boolean {
  return deactivateWebhook(id)
}

export function createWalletWebhook(wallet: string, body: unknown): WebhookMutationResult {
  const normalizedWallet = wallet.toLowerCase()
  if (countActiveWebhooksForWallet(normalizedWallet) >= MAX_WEBHOOKS_PER_WALLET) {
    return {
      ok: false,
      code: 'webhook_limit_exceeded',
      message: `Maximum ${MAX_WEBHOOKS_PER_WALLET} active webhooks per wallet`,
      status: 429,
    }
  }

  const parsed = parsePublicCreateInput(normalizedWallet, body)
  if (isWebhookServiceError(parsed)) return parsed

  const webhook = insertWebhook(parsed)

  return {
    ok: true,
    webhook: normalizeWebhookRecord(webhook),
    message: WEBHOOK_SECRET_NOTICE,
  }
}

export function listWalletWebhookRecords(wallet: string): WebhookRecord[] {
  return listWebhooksForWallet(wallet.toLowerCase()).map(normalizeWebhookRecord)
}

export function deactivateWalletWebhookRecord(id: number, wallet: string): boolean {
  return deactivateWebhookForWallet(id, wallet.toLowerCase())
}

export async function sendTestWebhook(id: number): Promise<WebhookTestResult> {
  const webhook = getWebhookById(id)
  if (!webhook) {
    return {
      ok: false,
      code: 'webhook_not_found',
      message: 'Webhook not found',
      status: 404,
    }
  }

  if (!isValidWebhookUrl(webhook.url)) {
    return invalidWebhookUrlError('Webhook URL is unsafe — must be HTTPS and not target internal networks')
  }

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery from DJD Agent Score' },
  }

  try {
    const body = JSON.stringify(testPayload)
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex')

    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DJD-Signature': `sha256=${signature}`,
        'X-DJD-Event': 'test',
      },
      body,
      signal: AbortSignal.timeout(10000),
    })

    return {
      ok: true,
      success: resp.ok,
      statusCode: resp.status,
      message: resp.ok ? 'Test delivery successful' : 'Test delivery failed',
    }
  } catch (err) {
    return {
      ok: true,
      success: false,
      statusCode: null,
      message: `Test delivery failed: ${(err as Error).message}`,
    }
  }
}
