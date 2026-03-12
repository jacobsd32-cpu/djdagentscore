import { db } from './connection.js'

export interface GrowthEventRow {
  id: number
  event_name: string
  source: string
  anonymous_id: string | null
  session_id: string | null
  page_path: string | null
  referrer: string | null
  wallet: string | null
  package_name: string | null
  user_agent: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  metadata_json: string | null
  created_at: string
}

export interface GrowthEventInsert {
  event_name: string
  source: string
  anonymous_id: string | null
  session_id: string | null
  page_path: string | null
  referrer: string | null
  wallet: string | null
  package_name: string | null
  user_agent: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  metadata_json: string | null
  created_at: string
}

export interface GrowthMetricRow {
  count: number
  unique_count: number
}

export interface GrowthBreakdownRow {
  key: string
  count: number
  unique_count: number
}

export interface GrowthPackageUsageRow {
  package_name: string
  count: number
  unique_wallets: number
}

const stmtInsertGrowthEvent = db.prepare(`
  INSERT INTO growth_events
    (event_name, source, anonymous_id, session_id, page_path, referrer, wallet, package_name,
     user_agent, utm_source, utm_medium, utm_campaign, metadata_json, created_at)
  VALUES
    (@event_name, @source, @anonymous_id, @session_id, @page_path, @referrer, @wallet, @package_name,
     @user_agent, @utm_source, @utm_medium, @utm_campaign, @metadata_json, @created_at)
`)

export function insertGrowthEvent(entry: GrowthEventInsert): void {
  stmtInsertGrowthEvent.run(entry)
}

export function getGrowthMetricByEvent(eventName: string, sinceIso: string): GrowthMetricRow {
  const row = db
    .prepare<[string, string], GrowthMetricRow>(`
      SELECT
        COUNT(*) as count,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), NULLIF(anonymous_id, ''), NULLIF(wallet, ''))) as unique_count
      FROM growth_events
      WHERE event_name = ? AND created_at >= ?
    `)
    .get(eventName, sinceIso)

  return {
    count: row?.count ?? 0,
    unique_count: row?.unique_count ?? 0,
  }
}

export function getGrowthBreakdownByPrefix(prefix: string, sinceIso: string, limit: number): GrowthBreakdownRow[] {
  return db
    .prepare<[string, string, number], GrowthBreakdownRow>(`
      SELECT
        event_name as key,
        COUNT(*) as count,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), NULLIF(anonymous_id, ''), NULLIF(wallet, ''))) as unique_count
      FROM growth_events
      WHERE event_name LIKE ? AND created_at >= ?
      GROUP BY event_name
      ORDER BY count DESC, event_name ASC
      LIMIT ?
    `)
    .all(`${prefix}%`, sinceIso, limit)
}

export function getTopGrowthReferrers(sinceIso: string, limit: number): GrowthBreakdownRow[] {
  return db
    .prepare<[string, number], GrowthBreakdownRow>(`
      SELECT
        referrer as key,
        COUNT(*) as count,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), NULLIF(anonymous_id, ''), NULLIF(wallet, ''))) as unique_count
      FROM growth_events
      WHERE event_name = 'landing_view'
        AND created_at >= ?
        AND referrer IS NOT NULL
        AND TRIM(referrer) != ''
      GROUP BY referrer
      ORDER BY count DESC, referrer ASC
      LIMIT ?
    `)
    .all(sinceIso, limit)
}

export function getTopGrowthPages(sinceIso: string, limit: number): GrowthBreakdownRow[] {
  return db
    .prepare<[string, number], GrowthBreakdownRow>(`
      SELECT
        page_path as key,
        COUNT(*) as count,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), NULLIF(anonymous_id, ''), NULLIF(wallet, ''))) as unique_count
      FROM growth_events
      WHERE created_at >= ?
        AND page_path IS NOT NULL
        AND TRIM(page_path) != ''
      GROUP BY page_path
      ORDER BY count DESC, page_path ASC
      LIMIT ?
    `)
    .all(sinceIso, limit)
}

export function getGrowthPackageUsage(sinceIso: string, limit: number): GrowthPackageUsageRow[] {
  return db
    .prepare<[string, number], GrowthPackageUsageRow>(`
      SELECT
        package_name,
        COUNT(*) as count,
        COUNT(DISTINCT wallet) as unique_wallets
      FROM growth_events
      WHERE event_name = 'package_request'
        AND created_at >= ?
        AND package_name IS NOT NULL
        AND TRIM(package_name) != ''
      GROUP BY package_name
      ORDER BY count DESC, package_name ASC
      LIMIT ?
    `)
    .all(sinceIso, limit)
}

export function getRecentGrowthEvents(sinceIso: string, limit: number): GrowthEventRow[] {
  return db
    .prepare<[string, number], GrowthEventRow>(`
      SELECT
        id,
        event_name,
        source,
        anonymous_id,
        session_id,
        page_path,
        referrer,
        wallet,
        package_name,
        user_agent,
        utm_source,
        utm_medium,
        utm_campaign,
        metadata_json,
        created_at
      FROM growth_events
      WHERE created_at >= ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .all(sinceIso, limit)
}

export function getPaidUsageSummary(sinceIso: string): {
  paid_queries: number
  paid_wallets: number
  api_key_queries: number
  external_wallets_scored: number
} {
  const row = db
    .prepare<
      [string],
      {
        paid_queries: number
        paid_wallets: number
        api_key_queries: number
        external_wallets_scored: number
      }
    >(`
      SELECT
        SUM(CASE WHEN response_source = 'paid' THEN 1 ELSE 0 END) as paid_queries,
        COUNT(DISTINCT CASE WHEN response_source = 'paid' AND requester_wallet IS NOT NULL THEN requester_wallet END) as paid_wallets,
        SUM(CASE WHEN response_source = 'api_key' THEN 1 ELSE 0 END) as api_key_queries,
        COUNT(DISTINCT CASE WHEN target_wallet IS NOT NULL THEN target_wallet END) as external_wallets_scored
      FROM query_log
      WHERE timestamp >= ?
    `)
    .get(sinceIso)

  return {
    paid_queries: row?.paid_queries ?? 0,
    paid_wallets: row?.paid_wallets ?? 0,
    api_key_queries: row?.api_key_queries ?? 0,
    external_wallets_scored: row?.external_wallets_scored ?? 0,
  }
}
