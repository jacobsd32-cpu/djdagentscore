import {
  getGrowthBreakdownByPrefix,
  getGrowthMetricByEvent,
  getGrowthPackageUsage,
  getPaidUsageSummary,
  getRecentGrowthEvents,
  getTopGrowthPages,
  getTopGrowthReferrers,
  insertGrowthEvent,
} from '../db.js'

const EVENT_NAME_REGEX = /^[a-z0-9_][a-z0-9_.-]{1,63}$/
const SOURCE_REGEX = /^[a-z0-9_-]{2,24}$/
const MAX_STRING_LENGTH = 240
const MAX_METADATA_LENGTH = 4_000

function trimToNull(value: unknown, maxLength = MAX_STRING_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function normalizeEventName(value: unknown): string | null {
  const eventName = trimToNull(value, 64)
  if (!eventName || !EVENT_NAME_REGEX.test(eventName)) return null
  return eventName
}

function normalizeSource(value: unknown): string {
  const source = trimToNull(value, 24)?.toLowerCase()
  return source && SOURCE_REGEX.test(source) ? source : 'web'
}

function normalizeWallet(value: unknown): string | null {
  const wallet = trimToNull(value, 42)?.toLowerCase()
  return wallet && /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null
}

function normalizeMetadata(value: unknown): string | null {
  if (value === undefined) return null
  try {
    const json = JSON.stringify(value)
    return json.length > MAX_METADATA_LENGTH ? json.slice(0, MAX_METADATA_LENGTH) : json
  } catch {
    return null
  }
}

export interface GrowthEventInput {
  event: unknown
  source?: unknown
  anonymousId?: unknown
  sessionId?: unknown
  page?: unknown
  referrer?: unknown
  wallet?: unknown
  packageName?: unknown
  userAgent?: unknown
  utmSource?: unknown
  utmMedium?: unknown
  utmCampaign?: unknown
  metadata?: unknown
}

export function trackGrowthEvent(input: GrowthEventInput):
  | {
      ok: true
    }
  | {
      ok: false
      code: 'invalid_request'
      message: string
    } {
  const eventName = normalizeEventName(input.event)
  if (!eventName) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'event must be a lowercase slug up to 64 characters',
    }
  }

  insertGrowthEvent({
    event_name: eventName,
    source: normalizeSource(input.source),
    anonymous_id: trimToNull(input.anonymousId, 100),
    session_id: trimToNull(input.sessionId, 100),
    page_path: trimToNull(input.page, 160),
    referrer: trimToNull(input.referrer, 240),
    wallet: normalizeWallet(input.wallet),
    package_name: trimToNull(input.packageName, 80),
    user_agent: trimToNull(input.userAgent, 255),
    utm_source: trimToNull(input.utmSource, 80),
    utm_medium: trimToNull(input.utmMedium, 80),
    utm_campaign: trimToNull(input.utmCampaign, 120),
    metadata_json: normalizeMetadata(input.metadata),
    created_at: new Date().toISOString(),
  })

  return { ok: true }
}

export function trackGrowthEventSafe(input: GrowthEventInput): void {
  try {
    trackGrowthEvent(input)
  } catch {
    // Growth instrumentation must never affect product flows.
  }
}

function clampDays(rawDays: string | undefined, fallback = 30): number {
  const parsed = Number.parseInt(rawDays ?? String(fallback), 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), 365)
}

function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 10_000) / 100
}

export function parsePackageClientHeader(headerValue: string | null | undefined): {
  packageName: string
  version: string | null
} | null {
  const value = trimToNull(headerValue, 120)
  if (!value) return null

  const [rawName, rawVersion] = value.split('/', 2)
  const packageName = trimToNull(rawName, 80)
  if (!packageName) return null

  return {
    packageName,
    version: trimToNull(rawVersion, 32),
  }
}

export function getAdminGrowthFunnelView(rawDays: string | undefined): {
  days: number
  acquisition: Record<string, unknown>
  activation: Record<string, unknown>
  monetization: Record<string, unknown>
  conversionRates: Record<string, number>
  recentEvents: Array<Record<string, unknown>>
} {
  const days = clampDays(rawDays)
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()

  const landing = getGrowthMetricByEvent('landing_view', sinceIso)
  const lookupSubmit = getGrowthMetricByEvent('lookup_submit', sinceIso)
  const lookupSuccess = getGrowthMetricByEvent('lookup_success', sinceIso)
  const docsClicks = getGrowthMetricByEvent('cta_docs', sinceIso)
  const pricingClicks = getGrowthMetricByEvent('cta_pricing', sinceIso)
  const registerClicks = getGrowthMetricByEvent('cta_register', sinceIso)
  const registrations = getGrowthMetricByEvent('agent_registered', sinceIso)
  const checkoutStarts = getGrowthMetricByEvent('billing_checkout_started', sinceIso)
  const billingSuccesses = getGrowthMetricByEvent('billing_success_viewed', sinceIso)
  const apiKeyCreated = getGrowthMetricByEvent('api_key_created', sinceIso)
  const paidUsage = getPaidUsageSummary(sinceIso)

  return {
    days,
    acquisition: {
      landingViews: landing.count,
      uniqueVisitors: landing.unique_count,
      docsClicks: docsClicks.count,
      pricingClicks: pricingClicks.count,
      registerClicks: registerClicks.count,
      pathClicks: getGrowthBreakdownByPrefix('path_', sinceIso, 10),
      topReferrers: getTopGrowthReferrers(sinceIso, 10),
      topPages: getTopGrowthPages(sinceIso, 10),
    },
    activation: {
      lookupAttempts: lookupSubmit.count,
      uniqueLookupSessions: lookupSubmit.unique_count,
      successfulLookups: lookupSuccess.count,
      successfulLookupSessions: lookupSuccess.unique_count,
      registeredWallets: registrations.count,
      packageUsage: getGrowthPackageUsage(sinceIso, 10),
    },
    monetization: {
      checkoutStarts: checkoutStarts.count,
      billingSuccessViews: billingSuccesses.count,
      apiKeysCreated: apiKeyCreated.count,
      paidQueries: paidUsage.paid_queries,
      paidWallets: paidUsage.paid_wallets,
      apiKeyQueries: paidUsage.api_key_queries,
      externalWalletsScored: paidUsage.external_wallets_scored,
    },
    conversionRates: {
      visitorToLookupPct: rate(lookupSubmit.unique_count, landing.unique_count),
      lookupToSuccessPct: rate(lookupSuccess.unique_count, lookupSubmit.unique_count),
      lookupToRegistrationPct: rate(registrations.count, lookupSuccess.unique_count),
      checkoutToSuccessPct: rate(billingSuccesses.count, checkoutStarts.count),
      visitorToPaidWalletPct: rate(paidUsage.paid_wallets, landing.unique_count),
    },
    recentEvents: getRecentGrowthEvents(sinceIso, 25).map((event) => ({
      id: event.id,
      event: event.event_name,
      source: event.source,
      page: event.page_path,
      referrer: event.referrer,
      wallet: event.wallet,
      packageName: event.package_name,
      metadata: event.metadata_json ? safeParseJson(event.metadata_json) : null,
      createdAt: event.created_at,
    })),
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
