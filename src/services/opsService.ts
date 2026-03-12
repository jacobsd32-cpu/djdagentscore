import {
  countCachedScores,
  countFraudReports,
  countIndexedTransactions,
  countIndexedWallets,
  countRegisteredAgents,
  countScoreOutcomes,
  countTotalQueryLogs,
} from '../db.js'
import { getIndexerStatus } from '../jobs/blockchainIndexer.js'
import { jobStats } from '../jobs/jobStats.js'
import { getHttpCounters, uptimeSeconds } from '../metrics.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

interface HealthPayload {
  status: 'ok'
  version: string
  uptime: number
  modelVersion: string
  experimentalStatus: true
  database: {
    cachedScores: number
    indexedWallets: number
    totalTransactionsIndexed: number
    totalFraudReports: number
    totalQueryLogEntries: number
    totalOutcomesTracked: number
  }
  indexer: {
    lastBlockIndexed: number
    running: boolean
  }
  jobs: {
    hourlyRefresh: {
      lastRun: string | null
      walletsRefreshed: number
    }
    intentMatcher: {
      lastRun: string | null
      queriesProcessed: number
    }
    outcomeMatcher: {
      lastRun: string | null
      outcomesRecorded: number
    }
    anomalyDetector: {
      lastRun: string | null
      anomaliesFound: number
    }
    dailyAggregator: {
      lastRun: string | null
    }
  }
}

const CACHE_TTL_MS = 10_000

let cachedHealthPayload: HealthPayload | null = null
let cachedHealthAt = 0

function buildHealthPayload(): HealthPayload {
  const indexer = getIndexerStatus()

  return {
    status: 'ok',
    version: MODEL_VERSION,
    modelVersion: MODEL_VERSION,
    experimentalStatus: true,
    uptime: uptimeSeconds(),
    database: {
      cachedScores: countCachedScores(),
      indexedWallets: countIndexedWallets(),
      totalTransactionsIndexed: countIndexedTransactions(),
      totalFraudReports: countFraudReports(),
      totalQueryLogEntries: countTotalQueryLogs(),
      totalOutcomesTracked: countScoreOutcomes(),
    },
    indexer: {
      lastBlockIndexed: indexer.lastBlockIndexed,
      running: indexer.running,
    },
    jobs: {
      hourlyRefresh: {
        lastRun: jobStats.hourlyRefresh.lastRun || null,
        walletsRefreshed: jobStats.hourlyRefresh.walletsRefreshed,
      },
      intentMatcher: {
        lastRun: jobStats.intentMatcher.lastRun || null,
        queriesProcessed: jobStats.intentMatcher.queriesProcessed,
      },
      outcomeMatcher: {
        lastRun: jobStats.outcomeMatcher.lastRun || null,
        outcomesRecorded: jobStats.outcomeMatcher.outcomesRecorded,
      },
      anomalyDetector: {
        lastRun: jobStats.anomalyDetector.lastRun || null,
        anomaliesFound: jobStats.anomalyDetector.anomaliesFound,
      },
      dailyAggregator: {
        lastRun: jobStats.dailyAggregator.lastRun || null,
      },
    },
  }
}

export function getHealthPayload(): HealthPayload {
  const now = Date.now()

  if (!cachedHealthPayload || now - cachedHealthAt > CACHE_TTL_MS) {
    cachedHealthPayload = buildHealthPayload()
    cachedHealthAt = now
  } else {
    cachedHealthPayload = {
      ...cachedHealthPayload,
      uptime: uptimeSeconds(),
    }
  }

  return cachedHealthPayload
}

export function resetHealthPayloadCache(): void {
  cachedHealthPayload = null
  cachedHealthAt = 0
}

export function getPrometheusMetricsPayload(): string {
  const lines: string[] = []

  lines.push('# HELP djd_http_requests_total Total HTTP requests by method, path, status')
  lines.push('# TYPE djd_http_requests_total counter')
  lines.push(...getHttpCounters())

  lines.push('')
  lines.push('# HELP djd_scores_cached Number of cached agent scores in the database')
  lines.push('# TYPE djd_scores_cached gauge')
  lines.push(`djd_scores_cached ${countCachedScores()}`)

  lines.push('# HELP djd_wallets_indexed Number of unique wallets in wallet_index')
  lines.push('# TYPE djd_wallets_indexed gauge')
  lines.push(`djd_wallets_indexed ${countIndexedWallets()}`)

  lines.push('# HELP djd_queries_total Total queries logged')
  lines.push('# TYPE djd_queries_total gauge')
  lines.push(`djd_queries_total ${countTotalQueryLogs()}`)

  lines.push('# HELP djd_registrations_total Total agent registrations')
  lines.push('# TYPE djd_registrations_total gauge')
  lines.push(`djd_registrations_total ${countRegisteredAgents()}`)

  lines.push('# HELP djd_reports_total Total fraud reports')
  lines.push('# TYPE djd_reports_total gauge')
  lines.push(`djd_reports_total ${countFraudReports()}`)

  lines.push('')
  lines.push('# HELP djd_process_uptime_seconds Process uptime in seconds')
  lines.push('# TYPE djd_process_uptime_seconds gauge')
  lines.push(`djd_process_uptime_seconds ${uptimeSeconds()}`)

  lines.push('# HELP djd_process_rss_bytes Resident set size in bytes')
  lines.push('# TYPE djd_process_rss_bytes gauge')
  lines.push(`djd_process_rss_bytes ${process.memoryUsage.rss()}`)
  lines.push('')

  return lines.join('\n')
}
