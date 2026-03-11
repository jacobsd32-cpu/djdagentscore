import { warnMissingGithubToken } from './config/env.js'
import { log } from './logger.js'
import { startWorkerRuntime } from './runtime/worker.js'

warnMissingGithubToken()
log.info('worker', 'DJD Agent Score worker starting')
startWorkerRuntime()
