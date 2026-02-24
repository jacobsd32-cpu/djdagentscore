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

const health = new Hono()

health.get('/', (c) => {
  const indexer = getIndexerStatus()

  return c.json({
    status: 'ok',
    version: MODEL_VERSION,
    modelVersion: MODEL_VERSION,
    experimentalStatus: true,
    uptime: Math.floor((Date.now() - startTime) / 1000),
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
  })
})

export default health
