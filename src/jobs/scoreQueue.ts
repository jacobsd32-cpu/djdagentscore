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

/**
 * Submit a background scoring job. Returns the jobId immediately.
 * Runs getOrCalculateScore with no timeout (full 90-day RPC scan allowed).
 */
export function submitJob(wallet: Address): string {
  const jobId = crypto.randomUUID()
  const job: ScoringJob = { jobId, wallet, status: 'pending', createdAt: Date.now() }
  jobs.set(jobId, job)

  // Fire-and-forget — no timeout so the full RPC scan can complete
  getOrCalculateScore(wallet, true, 0)
    .then((result) => {
      job.status = 'complete'
      job.result = result
    })
    .catch((err: unknown) => {
      job.status = 'error'
      job.error = (err instanceof Error ? err.message : String(err)).slice(0, 200)
    })

  return jobId
}

export function getJob(jobId: string): ScoringJob | undefined {
  return jobs.get(jobId)
}
