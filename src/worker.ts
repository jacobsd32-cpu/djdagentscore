import { warnMissingGithubToken } from './config/env.js'
import { log } from './logger.js'
import { startWorkerRuntime } from './runtime/worker.js'

process.env.DJD_RUNTIME_MODE ??= 'worker'

warnMissingGithubToken()
log.info('worker', `DJD Agent Score worker starting (mode: ${process.env.DJD_RUNTIME_MODE})`)
startWorkerRuntime()
