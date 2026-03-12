import { getJob, submitJob } from '../jobs/scoreQueue.js'
import { getOrCalculateScore } from '../scoring/engine.js'
import type { Address, BasicScoreResponse, FullScoreResponse } from '../types.js'
import { ErrorCodes } from '../errors.js'
import { normalizeWallet } from '../utils/walletUtils.js'

export interface ScoreServiceError {
  ok: false
  code: string
  message: string
  status: 400 | 404
  details?: Record<string, unknown>
}

interface ScoreServiceSuccess<T> {
  ok: true
  data: T
  status?: 202
}

export type ScoreServiceResult<T> = ScoreServiceError | ScoreServiceSuccess<T>

function invalidWalletError(): ScoreServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_WALLET,
    message: 'Invalid or missing wallet address',
    status: 400,
  }
}

function invalidJsonError(): ScoreServiceError {
  return {
    ok: false,
    code: ErrorCodes.INVALID_JSON,
    message: 'Invalid JSON body',
    status: 400,
  }
}

function buildBasicResponse(result: FullScoreResponse & { stale?: boolean }): BasicScoreResponse & { stale?: true } {
  return {
    wallet: result.wallet,
    score: result.score,
    tier: result.tier,
    confidence: result.confidence,
    recommendation: result.recommendation,
    modelVersion: result.modelVersion,
    lastUpdated: result.lastUpdated,
    computedAt: result.computedAt,
    scoreFreshness: result.scoreFreshness,
    ...(result.dataSource ? { dataSource: result.dataSource } : {}),
    ...(result.stale ? { stale: true as const } : {}),
  }
}

function parseWallet(rawWallet: string | undefined): Address | null {
  return normalizeWallet(rawWallet)
}

export async function getBasicScore(rawWallet: string | undefined): Promise<ScoreServiceResult<BasicScoreResponse & { stale?: true }>> {
  const wallet = parseWallet(rawWallet)
  if (!wallet) return invalidWalletError()

  const result = await getOrCalculateScore(wallet)
  return { ok: true, data: buildBasicResponse(result) }
}

export async function getFullScore(rawWallet: string | undefined): Promise<ScoreServiceResult<FullScoreResponse & { stale?: boolean }>> {
  const wallet = parseWallet(rawWallet)
  if (!wallet) return invalidWalletError()

  const result = await getOrCalculateScore(wallet)
  return { ok: true, data: result }
}

export async function refreshScore(rawWallet: string | undefined): Promise<ScoreServiceResult<FullScoreResponse & { stale?: boolean }>> {
  const wallet = parseWallet(rawWallet)
  if (!wallet) return invalidWalletError()

  const result = await getOrCalculateScore(wallet, true)
  return { ok: true, data: result }
}

export async function queueScoreComputation(
  queryWallet: string | undefined,
  bodyLoader: () => Promise<{ wallet?: string } | undefined>,
): Promise<ScoreServiceResult<{ jobId: string; status: 'pending'; wallet: Address; pollUrl: string }>> {
  let rawWallet = queryWallet

  if (!rawWallet) {
    try {
      rawWallet = (await bodyLoader())?.wallet
    } catch {
      return invalidJsonError()
    }
  }

  const wallet = parseWallet(rawWallet)
  if (!wallet) return invalidWalletError()

  const jobId = submitJob(wallet)
  return {
    ok: true,
    status: 202,
    data: { jobId, status: 'pending', wallet, pollUrl: `/v1/score/job/${jobId}` },
  }
}

export function getScoreJobStatus(jobId: string): ScoreServiceResult<Record<string, unknown>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_JOB_ID,
      message: 'Invalid job ID format',
      status: 400,
    }
  }

  const job = getJob(jobId)
  if (!job) {
    return {
      ok: false,
      code: ErrorCodes.JOB_NOT_FOUND,
      message: 'Job not found or expired',
      status: 404,
      details: { ttl: '10 minutes' },
    }
  }

  if (job.status === 'pending') {
    return { ok: true, data: { jobId, status: 'pending', wallet: job.wallet } }
  }

  if (job.status === 'error') {
    return { ok: true, data: { jobId, status: 'error', wallet: job.wallet, error: job.error } }
  }

  const result = job.result!
  return {
    ok: true,
    data: {
      jobId,
      status: 'complete',
      wallet: job.wallet,
      result: buildBasicResponse(result),
    },
  }
}

export async function getBatchScores(wallets: unknown): Promise<ScoreServiceResult<{ results: BasicScoreResponse[]; count: number }>> {
  if (!Array.isArray(wallets)) {
    return {
      ok: false,
      code: ErrorCodes.BATCH_INVALID,
      message: 'wallets must be an array',
      status: 400,
    }
  }

  if (wallets.length < 2 || wallets.length > 20) {
    return {
      ok: false,
      code: ErrorCodes.BATCH_INVALID,
      message: 'wallets array must contain 2-20 addresses',
      status: 400,
      details: { min: 2, max: 20, received: wallets.length },
    }
  }

  const normalized = wallets.map((wallet) => (typeof wallet === 'string' ? normalizeWallet(wallet) : null))
  const invalidCount = normalized.filter((wallet) => wallet === null).length
  if (invalidCount > 0) {
    return {
      ok: false,
      code: ErrorCodes.INVALID_WALLET,
      message: `${invalidCount} invalid wallet address(es)`,
      status: 400,
      details: { invalidCount },
    }
  }

  const results = await Promise.all(
    (normalized as Address[]).map(async (wallet) => {
      const result = await getOrCalculateScore(wallet)
      return buildBasicResponse(result)
    }),
  )

  return { ok: true, data: { results, count: results.length } }
}
