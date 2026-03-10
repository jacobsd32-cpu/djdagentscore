import { Hono } from 'hono'
import {
  countCachedScores,
  countFraudReports,
  countIndexedTransactions,
  countIndexedWallets,
  countScoreOutcomes,
  countTotalQueryLogs,
} from '../db.js'
import { getIndexerStatus } from '../jobs/blockchainIndexer.js'
import { jobStats } from '../jobs/jobStats.js'
import { MODEL_VERSION } from '../scoring/responseBuilders.js'

const startTime = Date.now()

/**
 * Cache the full health payload for CACHE_TTL_MS to prevent DB contention.
 *
 * The 6 COUNT(*) queries are cheap individually (~1ms each) but when the
 * USDC indexer is batch-writing thousands of rows, SQLite's WAL checkpoint
 * can block reads on a single-vCPU Fly machine. Caching for 10s ensures the
 * Fly health probe (60s interval, 25s timeout) always gets a near-instant
 * response regardless of indexer load.
 */
const CACHE_TTL_MS = 10_000

// biome-ignore lint/suspicious/noExplicitAny: health payload shape is ad-hoc
let cachedPayload: any = null
let cachedAt = 0

function buildHealthPayload(detailed: boolean) {
  // Public health check: minimal (for Fly.io probes and uptime monitors)
  const base = {
    status: 'ok',
    version: MODEL_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }

  if (!detailed) return base

  // Detailed health: includes DB stats, indexer state, job stats.
  // Only returned when X-Admin-Key header is present.
  const indexer = getIndexerStatus()

  return {
    ...base,
    modelVersion: MODEL_VERSION,
    experimentalStatus: true,
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

const health = new Hono()

health.get('/', (c) => {
  const now = Date.now()

  // Check if admin key is present for detailed response
  const adminKey = process.env.ADMIN_KEY
  const requestKey = c.req.header('x-admin-key')
  const isAdmin = !!(adminKey && requestKey && adminKey === requestKey)

  // Serve cached payload if fresh; otherwise rebuild (and cache)
  // Cache only the public (minimal) payload to avoid leaking admin data
  if (!isAdmin) {
    if (!cachedPayload || now - cachedAt > CACHE_TTL_MS) {
      cachedPayload = buildHealthPayload(false)
      cachedAt = now
    } else {
      cachedPayload.uptime = Math.floor((now - startTime) / 1000)
    }
    return c.json(cachedPayload)
  }

  // Admin: always build fresh detailed payload (no caching)
  return c.json(buildHealthPayload(true))
})

export default health
