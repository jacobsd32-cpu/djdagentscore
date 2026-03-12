import { serve } from '@hono/node-server'

import app, { FACILITATOR_URL, PAY_TO, PORT } from './app.js'
import { JOB_CONFIG } from './config/constants.js'
import { db } from './db.js'
import { log } from './logger.js'

let server: ReturnType<typeof serve> | null = null
let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log.info('server', 'Shutting down API...')

  if (server) {
    server.close(() => {
      log.info('server', 'All API connections closed')
      db.close()
      process.exit(0)
    })
    setTimeout(() => {
      log.warn('server', 'Forcing API exit after timeout')
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
})

export default app
