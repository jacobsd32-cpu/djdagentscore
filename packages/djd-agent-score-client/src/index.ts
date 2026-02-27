import type {
  Address,
  DataSource,
  BasicScoreResponse,
  FullScoreResponse,
  LeaderboardResponse,
  ReportBody,
  ReportResponse,
  AgentRegistrationBody,
  AgentRegistrationResponse,
  ComputeJobResponse,
  EconomyMetrics,
  ApiError,
  ClientOptions,
} from './types.js'

export type {
  Address,
  DataSource,
  BasicScoreResponse,
  FullScoreResponse,
  LeaderboardResponse,
  ReportBody,
  ReportResponse,
  AgentRegistrationBody,
  AgentRegistrationResponse,
  ComputeJobResponse,
  EconomyMetrics,
  ApiError,
  ClientOptions,
} from './types.js'

export class DJDScoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(message)
    this.name = 'DJDScoreError'
  }
}

const PAID_ENDPOINT_PRICES: Record<string, string> = {
  '/v1/score/full': '$0.10',
  '/v1/score/refresh': '$0.25',
  '/v1/report': '$0.02',
  '/v1/data/fraud/blacklist': '$0.05',
}

export class DJDAgentScore {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly fetchFn: typeof globalThis.fetch
  private readonly paymentHeaderProvider?: ClientOptions['paymentHeaderProvider']

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.maxRetries = opts.maxRetries ?? 2
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.paymentHeaderProvider = opts.paymentHeaderProvider
  }

  // ── Free endpoints ──────────────────────────────────────────────────

  /** Get basic score (free tier, 10/day). */
  async getBasicScore(wallet: string): Promise<BasicScoreResponse> {
    return this.get<BasicScoreResponse>(`/v1/score/basic?wallet=${wallet}`)
  }

  /** Get leaderboard (free). */
  async getLeaderboard(): Promise<LeaderboardResponse> {
    return this.get<LeaderboardResponse>('/v1/leaderboard')
  }

  /** Register or update agent profile (free). */
  async registerAgent(body: AgentRegistrationBody): Promise<AgentRegistrationResponse> {
    return this.post<AgentRegistrationResponse>('/v1/agent/register', body)
  }

  /** Get economy metrics (free). */
  async getEconomyMetrics(period: 'daily' | 'weekly' | 'monthly' = 'daily', limit = 30): Promise<EconomyMetrics> {
    return this.get<EconomyMetrics>(`/v1/data/economy?period=${period}&limit=${limit}`)
  }

  // ── Paid endpoints (x402) ───────────────────────────────────────────

  /** Get full score with dimension breakdown ($0.10 USDC). */
  async getFullScore(wallet: string): Promise<FullScoreResponse> {
    return this.get<FullScoreResponse>(`/v1/score/full?wallet=${wallet}`)
  }

  /** Force live recalculation ($0.25 USDC). */
  async refreshScore(wallet: string): Promise<FullScoreResponse> {
    return this.get<FullScoreResponse>(`/v1/score/refresh?wallet=${wallet}`)
  }

  /** Submit fraud/misconduct report ($0.02 USDC). */
  async submitReport(body: ReportBody): Promise<ReportResponse> {
    return this.post<ReportResponse>('/v1/report', body)
  }

  /** Submit async compute job. */
  async submitCompute(wallet: string): Promise<ComputeJobResponse> {
    return this.post<ComputeJobResponse>('/v1/score/compute', { wallet })
  }

  /** Poll compute job status. */
  async pollJob(jobId: string): Promise<ComputeJobResponse> {
    return this.get<ComputeJobResponse>(`/v1/score/job/${jobId}`)
  }

  /** Wait for a score to be computed (poll until complete or timeout). */
  async waitForScore(wallet: string, opts?: { pollIntervalMs?: number; maxWaitMs?: number }): Promise<FullScoreResponse> {
    const pollInterval = opts?.pollIntervalMs ?? 2_000
    const maxWait = opts?.maxWaitMs ?? 120_000
    const deadline = Date.now() + maxWait

    const job = await this.submitCompute(wallet)
    let current = job

    while (current.status !== 'complete' && current.status !== 'error' && Date.now() < deadline) {
      await sleep(pollInterval)
      current = await this.pollJob(current.jobId)
    }

    if (current.status === 'error') {
      throw new DJDScoreError(current.error ?? 'Compute job failed', 500, {
        error: current.error ?? 'compute_failed',
      })
    }

    if (current.status !== 'complete') {
      throw new DJDScoreError('Compute job timed out', 408, { error: 'compute_timeout' })
    }

    return current.result!
  }

  // ── Internal HTTP methods ───────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    // Add x402 payment header for paid endpoints
    const endpointPath = path.split('?')[0]!
    if (this.paymentHeaderProvider && endpointPath in PAID_ENDPOINT_PRICES) {
      const paymentHeader = await this.paymentHeaderProvider(
        endpointPath,
        PAID_ENDPOINT_PRICES[endpointPath]!,
      )
      headers['X-PAYMENT'] = paymentHeader
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000))
      }

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)

        const response = await this.fetchFn(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })

        clearTimeout(timer)

        if (response.ok) {
          return (await response.json()) as T
        }

        const errorBody = await response.json().catch(() => ({ error: response.statusText })) as ApiError

        // Don't retry 4xx (client errors) except 429 (rate limit)
        if (response.status < 500 && response.status !== 429) {
          throw new DJDScoreError(errorBody.message ?? errorBody.error, response.status, errorBody)
        }

        // Retry 5xx and 429
        lastError = new DJDScoreError(errorBody.message ?? errorBody.error, response.status, errorBody)
      } catch (err) {
        if (err instanceof DJDScoreError && err.status < 500 && err.status !== 429) {
          throw err
        }
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    throw lastError ?? new Error('Request failed after retries')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
