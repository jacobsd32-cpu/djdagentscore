/**
 * In-memory job queue for async score computation.
 * Jobs expire after 10 minutes. Cleanup runs every 5 minutes.
 */

import { getOrCalculateScore } from '../scoring/engine.js'
import type { Address, FullScoreResponse } from '../types.js'

const JOB_TTL_MS = 10 * 60 * 1000  // 10 min
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

export interface ScoringJob {
  jobId: string
  wallet: Address
  status: 'pending' | 'complete' | 'error'
  result?: FullScoreResponse
  error?: string
  createdAt: number
}

const jobs = new Map<string, ScoringJob>()

// Prune expired jobs; unref so it doesn't prevent process exit
const _cleanup = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id)
  }
}, CLEANUP_INTERVAL_MS).unref()

void _cleanup

// ----- Concurrency limiter: max 1 job running at a time -----
// Each full RPC scan does 60+ getLogs calls; running many in parallel OOMs
// the 1GB fly.io machine. Jobs are queued and run serially.
let activeJobs = 0
const MAX_CONCURRENT_JOBS = 1
const pendingQueue: Array<() => void> = []

function withConcurrencyLimit(fn: () => Promise<void>): Promise<void> {
  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs++
    fn().finally(() => {
      activeJobs--
      const next = pendingQueue.shift()
      if (next) next()
    })
    return Promise.resolve()
  } else {
    return new Promise<void>((resolve, reject) => {
      if (pendingQueue.length >= 50) {
        reject(new Error('Queue full'))
        return
      }
      pendingQueue.push(() => {
        activeJobs++
        fn().finally(() => {
          activeJobs--
          const next = pendingQueue.shift()
          if (next) next()
        })
        resolve()
      })
    })
  }
}

/**
 * Submit a background scoring job. Returns the jobId immediately.
 * Runs getOrCalculateScore with no timeout (full RPC scan allowed).
 * At most MAX_CONCURRENT_JOBS run simultaneously to avoid OOM.
 */
export function submitJob(wallet: Address): string {
  const jobId = crypto.randomUUID()
  const job: ScoringJob = { jobId, wallet, status: 'pending', createdAt: Date.now() }
  jobs.set(jobId, job)

  withConcurrencyLimit(async () => {
    try {
      const result = await getOrCalculateScore(wallet, true, 0)
      job.status = 'complete'
      job.result = result
    } catch (err: unknown) {
      job.status = 'error'
      job.error = 'Score computation failed'
    }
  }).catch(() => {
    job.status = 'error'
    job.error = 'Queue full'
  })

  return jobId
}

export function getJob(jobId: string): ScoringJob | undefined {
  return jobs.get(jobId)
}
