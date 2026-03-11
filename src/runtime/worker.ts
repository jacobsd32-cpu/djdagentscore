import { JOB_INTERVALS, JOB_STARTUP_DELAYS } from '../config/constants.js'
import { envEnabled } from '../config/env.js'
import { db, getIndexerState, setIndexerState } from '../db.js'
import { startBlockchainIndexer, stopBlockchainIndexer } from '../jobs/blockchainIndexer.js'
import { runAnomalyDetector, runSybilMonitor } from '../jobs/anomalyDetector.js'
import { runDailyAggregator } from '../jobs/dailyAggregator.js'
import { runDataPruner } from '../jobs/dataPruner.js'
import { runGithubReverify } from '../jobs/githubReverify.js'
import { runIntentMatcher } from '../jobs/intentMatcher.js'
import { runOutcomeMatcher } from '../jobs/outcomeMatcher.js'
import { runReputationPublisher } from '../jobs/reputationPublisher.js'
import { runHourlyRefresh } from '../jobs/scoreRefresh.js'
import { startUsdcTransferIndexer, stopUsdcTransferIndexer } from '../jobs/usdcTransferIndexer.js'
import { processWebhookQueue } from '../jobs/webhookDelivery.js'
import { log } from '../logger.js'
import { runAutoRecalibration } from '../scoring/autoRecalibration.js'

const ENABLE_BLOCKCHAIN_INDEXER = envEnabled('ENABLE_BLOCKCHAIN_INDEXER')
const ENABLE_USDC_INDEXER = envEnabled('ENABLE_USDC_INDEXER')
const ENABLE_HOURLY_REFRESH = envEnabled('ENABLE_HOURLY_REFRESH')

interface StartWorkerOptions {
  closeDbOnShutdown?: boolean
  exitOnShutdown?: boolean
  registerSignalHandlers?: boolean
}

interface WorkerRuntime {
  shutdown: () => void
}

let activeRuntime: WorkerRuntime | null = null

export function startWorkerRuntime(options: StartWorkerOptions = {}): WorkerRuntime {
  if (activeRuntime) return activeRuntime

  const {
    closeDbOnShutdown = true,
    exitOnShutdown = true,
    registerSignalHandlers = true,
  } = options

  const intervals: ReturnType<typeof setInterval>[] = []
  const timeouts: ReturnType<typeof setTimeout>[] = []
  let shuttingDown = false

  const registerInterval = (timer: ReturnType<typeof setInterval>) => {
    intervals.push(timer)
    return timer
  }
  const registerTimeout = (timer: ReturnType<typeof setTimeout>) => {
    timeouts.push(timer)
    return timer
  }

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('jobs', 'Stopping background processes...')

    for (const timer of intervals) clearInterval(timer)
    for (const timer of timeouts) clearTimeout(timer)

    stopBlockchainIndexer()
    stopUsdcTransferIndexer()
    activeRuntime = null

    if (closeDbOnShutdown) db.close()
    if (exitOnShutdown) process.exit(0)
  }

  if (registerSignalHandlers) {
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  }

  log.info('jobs', 'Starting background processes...')

  if (ENABLE_BLOCKCHAIN_INDEXER) {
    registerTimeout(setTimeout(() => {
      startBlockchainIndexer().catch((err) => {
        log.error('indexer', 'Fatal error, stopped', err)
      })
    }, JOB_STARTUP_DELAYS.BLOCKCHAIN_INDEXER_MS))
  } else {
    log.warn('jobs', 'Blockchain indexer disabled via ENABLE_BLOCKCHAIN_INDEXER')
  }

  if (ENABLE_USDC_INDEXER) {
    registerTimeout(setTimeout(() => {
      startUsdcTransferIndexer().catch((err) => {
        log.error('usdc-indexer', 'Fatal error, stopped', err)
      })
    }, JOB_STARTUP_DELAYS.USDC_INDEXER_MS))
  } else {
    log.warn('jobs', 'USDC transfer indexer disabled via ENABLE_USDC_INDEXER')
  }

  let hourlyRunning = false
  if (ENABLE_HOURLY_REFRESH) {
    registerInterval(setInterval(async () => {
      if (hourlyRunning) return
      hourlyRunning = true
      try {
        await runHourlyRefresh()
      } catch (err) {
        log.error('refresh', 'Error in hourlyRefresh', err)
      } finally {
        hourlyRunning = false
      }
    }, JOB_INTERVALS.HOURLY_REFRESH_MS))
  } else {
    log.warn('jobs', 'Hourly refresh disabled via ENABLE_HOURLY_REFRESH')
  }

  let intentRunning = false
  registerTimeout(setTimeout(() => {
    runIntentMatcher(db).catch((err) => log.error('intent', 'Startup error', err))
    registerInterval(setInterval(async () => {
      if (intentRunning) return
      intentRunning = true
      try {
        await runIntentMatcher(db)
      } catch (err) {
        log.error('intent', 'Error in intentMatcher', err)
      } finally {
        intentRunning = false
      }
    }, JOB_INTERVALS.INTENT_MATCHER_MS))
  }, JOB_STARTUP_DELAYS.INTENT_MATCHER_MS))

  let outcomeRunning = false
  registerTimeout(setTimeout(() => {
    runOutcomeMatcher(db).catch((err) => log.error('outcome', 'Startup error', err))
    registerInterval(setInterval(async () => {
      if (outcomeRunning) return
      outcomeRunning = true
      try {
        await runOutcomeMatcher(db)
      } catch (err) {
        log.error('outcome', 'Error in outcomeMatcher', err)
      } finally {
        outcomeRunning = false
      }
    }, JOB_INTERVALS.OUTCOME_MATCHER_MS))
  }, JOB_STARTUP_DELAYS.OUTCOME_MATCHER_MS))

  let recalRunning = false
  registerTimeout(setTimeout(() => {
    runAutoRecalibration(db).catch((err) => log.error('recalibration', 'Startup error', err))
    registerInterval(setInterval(async () => {
      if (recalRunning) return
      recalRunning = true
      try {
        await runAutoRecalibration(db)
      } catch (err) {
        log.error('recalibration', 'Error in autoRecalibration', err)
      } finally {
        recalRunning = false
      }
    }, JOB_INTERVALS.AUTO_RECALIBRATION_MS))
  }, JOB_STARTUP_DELAYS.AUTO_RECALIBRATION_MS))

  let anomalyRunning = false
  registerInterval(setInterval(async () => {
    if (anomalyRunning) return
    anomalyRunning = true
    try {
      await runAnomalyDetector(db)
    } catch (err) {
      log.error('anomaly', 'Error in anomalyDetector', err)
    } finally {
      anomalyRunning = false
    }
  }, JOB_INTERVALS.ANOMALY_DETECTOR_MS))

  let sybilRunning = false
  registerInterval(setInterval(async () => {
    if (sybilRunning) return
    sybilRunning = true
    try {
      await runSybilMonitor(db)
    } catch (err) {
      log.error('sybil', 'Error in sybilMonitor', err)
    } finally {
      sybilRunning = false
    }
  }, JOB_INTERVALS.SYBIL_MONITOR_MS))

  let lastAggDate = getIndexerState('last_agg_date') ?? ''
  let dailyRunning = false
  registerInterval(setInterval(async () => {
    if (dailyRunning) return
    dailyRunning = true
    try {
      const today = new Date().toISOString().split('T')[0]!
      if (today !== lastAggDate) {
        await runDailyAggregator(db)
        await runGithubReverify()
        await runDataPruner(db)
        lastAggDate = today
        setIndexerState('last_agg_date', today)
      }
    } catch (err) {
      log.error('daily', 'Error in dailyAggregator', err)
    } finally {
      dailyRunning = false
    }
  }, JOB_INTERVALS.DAILY_AGGREGATOR_MS))

  registerInterval(setInterval(async () => {
    try {
      await processWebhookQueue()
    } catch (err) {
      log.error('webhooks', 'Error in webhook delivery', err)
    }
  }, JOB_INTERVALS.WEBHOOK_DELIVERY_MS))

  let publisherRunning = false
  registerTimeout(setTimeout(() => {
    runReputationPublisher().catch((err) => log.error('erc8004-publisher', 'Startup error', err))
    registerInterval(setInterval(async () => {
      if (publisherRunning) return
      publisherRunning = true
      try {
        await runReputationPublisher()
      } catch (err) {
        log.error('erc8004-publisher', 'Error in reputationPublisher', err)
      } finally {
        publisherRunning = false
      }
    }, JOB_INTERVALS.REPUTATION_PUBLISHER_MS))
  }, JOB_STARTUP_DELAYS.REPUTATION_PUBLISHER_MS))

  log.info('jobs', 'All background processes registered')

  activeRuntime = { shutdown }
  return activeRuntime
}
