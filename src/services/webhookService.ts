import crypto from 'node:crypto'
import type { WebhookDeliveryRow, WebhookRow } from '../db.js'
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
import { isValidWebhookUrl, REPORT_REASONS, type ReportReason } from '../types.js'

export const VALID_WEBHOOK_EVENTS = [
  'score.updated',
  'score.expired',
  'fraud.reported',
  'fraud.disputed',
  'fraud.dispute.resolved',
  'forensics.risk.changed',
  'forensics.watchlist.entered',
  'forensics.watchlist.cleared',
  'anomaly.score_drop',
  'anomaly.score_spike',
  'anomaly.balance_freefall',
  'anomaly.sybil_flagged',
  'agent.registered',
  'score.threshold',
]

export const FORENSICS_WEBHOOK_EVENTS = [
  'fraud.reported',
  'fraud.disputed',
  'fraud.dispute.resolved',
  'forensics.risk.changed',
  'forensics.watchlist.entered',
  'forensics.watchlist.cleared',
] as const

export const VALID_FORENSICS_RISK_LEVELS = ['clear', 'watch', 'elevated', 'critical'] as const
export const ANOMALY_WEBHOOK_EVENTS = [
  'anomaly.score_drop',
  'anomaly.score_spike',
  'anomaly.balance_freefall',
  'anomaly.sybil_flagged',
] as const

interface WebhookPresetDefinition {
  description: string
  events: readonly string[]
  defaultThresholdScore?: number
}

export type WebhookForensicsRiskLevel = (typeof VALID_FORENSICS_RISK_LEVELS)[number]

export interface WebhookForensicsFilter {
  minimum_risk_level?: WebhookForensicsRiskLevel
  reasons?: ReportReason[]
}

export const DEFAULT_WEBHOOK_THRESHOLD_SCORE = 60
export const MAX_WEBHOOKS_PER_WALLET = 10
export const WEBHOOK_PRESETS: Record<
  'score_monitoring' | 'forensics_monitoring' | 'forensics_disputes' | 'forensics_watchlist' | 'anomaly_monitoring',
  WebhookPresetDefinition
> = {
  score_monitoring: {
    description: 'Track score refreshes and threshold crossings for a wallet.',
    events: ['score.updated', 'score.expired', 'score.threshold'],
    defaultThresholdScore: DEFAULT_WEBHOOK_THRESHOLD_SCORE,
  },
  forensics_monitoring: {
    description: 'Track Forensics incidents, disputes, watchlist changes, and risk transitions for a wallet.',
    events: [
      'fraud.reported',
      'fraud.disputed',
      'fraud.dispute.resolved',
      'forensics.risk.changed',
      'forensics.watchlist.entered',
      'forensics.watchlist.cleared',
    ],
  },
  forensics_disputes: {
    description: 'Track dispute openings and resolutions for a wallet.',
    events: ['fraud.disputed', 'fraud.dispute.resolved'],
  },
  forensics_watchlist: {
    description: 'Track when a wallet enters, exits, or changes risk state in DJD Forensics.',
    events: ['forensics.risk.changed', 'forensics.watchlist.entered', 'forensics.watchlist.cleared'],
  },
  anomaly_monitoring: {
    description: 'Track score shocks, balance freefalls, and new Sybil flags for a wallet.',
    events: [...ANOMALY_WEBHOOK_EVENTS],
  },
}

export type WebhookPresetName = keyof typeof WEBHOOK_PRESETS

const WEBHOOK_SECRET_NOTICE = 'Store the secret securely — used to verify webhook signatures.'

type WebhookErrorStatus = 400 | 404 | 429

interface WebhookCreateInput {
  wallet: string
  url: string
  secret: string
  events: string[]
  tier: string
  thresholdScore: number | null
  forensicsFilter: WebhookForensicsFilter | null
  presetsApplied: string[]
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
  forensics_filter?: WebhookForensicsFilter | null
}

export interface WebhookDetail extends WebhookRecord {
  recent_deliveries: WebhookDeliveryRow[]
}

export interface WebhookMutationSuccess {
  ok: true
  webhook: WebhookRecord
  message: string
  presetsApplied: string[]
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

function parseWebhookReasons(reasons: string | null | undefined): ReportReason[] | null {
  if (!reasons) return null

  try {
    const parsed = JSON.parse(reasons) as unknown
    if (!Array.isArray(parsed)) return null
    const filtered = parsed.filter(
      (reason): reason is ReportReason => typeof reason === 'string' && REPORT_REASONS.includes(reason as ReportReason),
    )
    return filtered.length > 0 ? filtered : null
  } catch {
    return null
  }
}

function parseWebhookForensicsFilter(row: WebhookRow): WebhookForensicsFilter | null {
  const minimumRiskLevel =
    typeof row.forensics_min_risk_level === 'string' &&
    VALID_FORENSICS_RISK_LEVELS.includes(row.forensics_min_risk_level as WebhookForensicsRiskLevel)
      ? (row.forensics_min_risk_level as WebhookForensicsRiskLevel)
      : undefined

  const reasons = parseWebhookReasons(row.forensics_report_reasons)
  if (!minimumRiskLevel && !reasons) return null

  return {
    ...(minimumRiskLevel ? { minimum_risk_level: minimumRiskLevel } : {}),
    ...(reasons ? { reasons } : {}),
  }
}

function normalizeWebhookRecord(row: WebhookRow): WebhookRecord {
  const forensicsFilter = parseWebhookForensicsFilter(row)

  return {
    id: row.id,
    wallet: row.wallet,
    url: row.url,
    secret: row.secret,
    events: parseWebhookEvents(row.events),
    tier: row.tier,
    is_active: row.is_active,
    created_at: row.created_at,
    failure_count: row.failure_count,
    last_delivery_at: row.last_delivery_at,
    disabled_at: row.disabled_at,
    threshold_score: row.threshold_score ?? null,
    ...(forensicsFilter ? { forensics_filter: forensicsFilter } : {}),
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

function validateWebhookPresetNames(presets: unknown): WebhookPresetName[] | null {
  if (!Array.isArray(presets) || presets.length === 0) return null
  if (
    !presets.every((preset): preset is WebhookPresetName => typeof preset === 'string' && preset in WEBHOOK_PRESETS)
  ) {
    return null
  }
  return presets
}

function hasForensicsEvents(events: string[]): boolean {
  return events.some((event) => (FORENSICS_WEBHOOK_EVENTS as readonly string[]).includes(event))
}

function resolveThresholdScore(
  body: Record<string, unknown>,
  events: string[],
  presetsApplied: WebhookPresetName[],
): number | null | WebhookServiceError {
  const includesThresholdEvent = events.includes('score.threshold')

  if (body.threshold_score === undefined || body.threshold_score === null) {
    if (!includesThresholdEvent) return null

    const presetDefault = presetsApplied
      .map((preset) => WEBHOOK_PRESETS[preset].defaultThresholdScore)
      .find((value): value is number => value !== undefined)

    return presetDefault ?? DEFAULT_WEBHOOK_THRESHOLD_SCORE
  }

  if (!includesThresholdEvent) {
    return invalidWebhookError('threshold_score requires the score.threshold event or a preset that includes it')
  }

  if (
    typeof body.threshold_score !== 'number' ||
    !Number.isInteger(body.threshold_score) ||
    body.threshold_score < 0 ||
    body.threshold_score > 100
  ) {
    return invalidWebhookError('threshold_score must be an integer between 0 and 100')
  }

  return body.threshold_score
}

function resolveForensicsFilter(
  body: Record<string, unknown>,
  events: string[],
): WebhookForensicsFilter | null | WebhookServiceError {
  if (body.forensics_filter === undefined || body.forensics_filter === null) return null
  if (!isRecord(body.forensics_filter)) {
    return invalidWebhookError('forensics_filter must be an object with minimum_risk_level and/or reasons')
  }
  if (!hasForensicsEvents(events)) {
    return invalidWebhookError('forensics_filter requires at least one Forensics monitoring event')
  }

  const minimumRiskLevel = body.forensics_filter.minimum_risk_level
  const reasons = body.forensics_filter.reasons

  const normalized: WebhookForensicsFilter = {}

  if (minimumRiskLevel !== undefined) {
    if (
      typeof minimumRiskLevel !== 'string' ||
      !VALID_FORENSICS_RISK_LEVELS.includes(minimumRiskLevel as WebhookForensicsRiskLevel)
    ) {
      return invalidWebhookError(
        `forensics_filter.minimum_risk_level must be one of: ${VALID_FORENSICS_RISK_LEVELS.join(', ')}`,
      )
    }
    normalized.minimum_risk_level = minimumRiskLevel as WebhookForensicsRiskLevel
  }

  if (reasons !== undefined) {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return invalidWebhookError(`forensics_filter.reasons must be a non-empty array of: ${REPORT_REASONS.join(', ')}`)
    }

    if (
      !reasons.every(
        (reason): reason is ReportReason =>
          typeof reason === 'string' && REPORT_REASONS.includes(reason as ReportReason),
      )
    ) {
      return invalidWebhookError(`forensics_filter.reasons must only contain: ${REPORT_REASONS.join(', ')}`)
    }

    normalized.reasons = [...new Set(reasons)]
  }

  if (!normalized.minimum_risk_level && !normalized.reasons) {
    return invalidWebhookError('forensics_filter must include minimum_risk_level and/or reasons')
  }

  return normalized
}

function resolveWebhookSelection(body: Record<string, unknown>):
  | {
      events: string[]
      presetsApplied: WebhookPresetName[]
      thresholdScore: number | null
      forensicsFilter: WebhookForensicsFilter | null
    }
  | WebhookServiceError {
  const presetList: WebhookPresetName[] = []

  if (typeof body.preset === 'string' && body.preset in WEBHOOK_PRESETS) {
    presetList.push(body.preset as WebhookPresetName)
  } else if (body.preset !== undefined) {
    return invalidWebhookError(`Invalid preset. Valid presets: ${Object.keys(WEBHOOK_PRESETS).join(', ')}`)
  }

  if (body.presets !== undefined) {
    const presets = validateWebhookPresetNames(body.presets)
    if (!presets) {
      return invalidWebhookError(`Invalid presets. Valid presets: ${Object.keys(WEBHOOK_PRESETS).join(', ')}`)
    }
    presetList.push(...presets)
  }

  const uniquePresets = [...new Set(presetList)]
  const presetEvents = uniquePresets.flatMap((preset) => [...WEBHOOK_PRESETS[preset].events])

  let rawEvents: string[] = []
  if (body.events !== undefined) {
    const events = validateWebhookEvents(body.events)
    if (!events) {
      return invalidWebhookError(`Invalid events. Valid: ${VALID_WEBHOOK_EVENTS.join(', ')}`)
    }
    rawEvents = events
  }

  const mergedEvents = [...new Set([...presetEvents, ...rawEvents])]
  if (mergedEvents.length === 0) {
    return invalidWebhookError(
      `events[] or preset(s) required. Valid presets: ${Object.keys(WEBHOOK_PRESETS).join(', ')}`,
    )
  }

  const thresholdScore = resolveThresholdScore(body, mergedEvents, uniquePresets)
  if (typeof thresholdScore !== 'number' && thresholdScore !== null) return thresholdScore

  const forensicsFilter = resolveForensicsFilter(body, mergedEvents)
  if (forensicsFilter && 'ok' in forensicsFilter) return forensicsFilter

  return {
    events: mergedEvents,
    presetsApplied: uniquePresets,
    thresholdScore,
    forensicsFilter,
  }
}

function parseAdminCreateInput(body: unknown): WebhookCreateInput | WebhookServiceError {
  if (!isRecord(body) || !body.wallet || !body.url) {
    return invalidWebhookError('wallet, url, and events[] or preset(s) are required')
  }

  if (typeof body.wallet !== 'string') {
    return invalidWebhookError('wallet, url, and events[] or preset(s) are required')
  }

  if (typeof body.url !== 'string' || !isValidWebhookUrl(body.url)) {
    return invalidWebhookUrlError('Invalid webhook URL: must be HTTPS and not target internal networks')
  }

  const selection = resolveWebhookSelection(body)
  if ('ok' in selection) return selection

  return {
    wallet: body.wallet.toLowerCase(),
    url: body.url,
    secret: crypto.randomBytes(32).toString('hex'),
    events: selection.events,
    tier: getTier(body.tier, 'basic'),
    thresholdScore: selection.thresholdScore,
    forensicsFilter: selection.forensicsFilter,
    presetsApplied: selection.presetsApplied,
  }
}

function parsePublicCreateInput(wallet: string, body: unknown): WebhookCreateInput | WebhookServiceError {
  if (!isRecord(body) || !body.url) {
    return invalidWebhookError('url and events[] or preset(s) are required')
  }

  if (typeof body.url !== 'string' || !isValidWebhookUrl(body.url)) {
    return invalidWebhookUrlError('Invalid webhook URL: must be HTTPS and not target internal networks')
  }

  const selection = resolveWebhookSelection(body)
  if ('ok' in selection) return selection

  return {
    wallet: wallet.toLowerCase(),
    url: body.url,
    secret: crypto.randomBytes(32).toString('hex'),
    events: selection.events,
    tier: 'basic',
    thresholdScore: selection.thresholdScore,
    forensicsFilter: selection.forensicsFilter,
    presetsApplied: selection.presetsApplied,
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
    presetsApplied: parsed.presetsApplied,
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
    presetsApplied: parsed.presetsApplied,
  }
}

export function createManagedWebhook(targetWallet: string, body: unknown): WebhookMutationResult {
  const parsed = parsePublicCreateInput(targetWallet.toLowerCase(), body)
  if (isWebhookServiceError(parsed)) return parsed

  const webhook = insertWebhook(parsed)

  return {
    ok: true,
    webhook: normalizeWebhookRecord(webhook),
    message: WEBHOOK_SECRET_NOTICE,
    presetsApplied: parsed.presetsApplied,
  }
}

export function listWebhookPresets() {
  return Object.entries(WEBHOOK_PRESETS).map(([name, preset]) => ({
    name,
    description: preset.description,
    events: [...preset.events],
    ...(preset.defaultThresholdScore !== undefined ? { threshold_score_default: preset.defaultThresholdScore } : {}),
  }))
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
    const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')

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
