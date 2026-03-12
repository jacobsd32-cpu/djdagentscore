import { serve } from '@hono/node-server'

import app, { FACILITATOR_URL, PAY_TO, PORT } from './app.js'
import { JOB_CONFIG } from './config/constants.js'
import { db } from './db.js'
import { log } from './logger.js'
import { startWorkerRuntime } from './runtime/worker.js'

let server: ReturnType<typeof serve> | null = null
let shuttingDown = false
let workerRuntime: ReturnType<typeof startWorkerRuntime> | null = null

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log.info('server', 'Shutting down...')

  workerRuntime?.shutdown()

  if (server) {
    server.close(() => {
      log.info('server', 'All connections closed')
      db.close()
      process.exit(0)
    })
    setTimeout(() => {
      log.warn('server', 'Forcing exit after timeout')
      db.close()
      process.exit(1)
    }, JOB_CONFIG.SHUTDOWN_TIMEOUT_MS).unref()
    return
  }

  db.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server = serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  log.info('server', `DJD Agent Score API running on http://localhost:${info.port}`)
  log.info('server', `payTo: ${PAY_TO}`)
  log.info('server', `facilitator: ${FACILITATOR_URL}`)
  log.info('server', 'Combined runtime active (API + worker)')
  workerRuntime = startWorkerRuntime({
    closeDbOnShutdown: false,
    exitOnShutdown: false,
    registerSignalHandlers: false,
  })
})

export default app
