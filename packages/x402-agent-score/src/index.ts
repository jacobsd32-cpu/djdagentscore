import type { Context, MiddlewareHandler } from 'hono'

// ---------- Types ----------

export interface AgentScoreOptions {
  /**
   * Minimum composite score (0–100) required to pass.
   * Requests from wallets below this score receive a 403.
   * Default: 0 (headers-only mode — no requests are blocked)
   */
  minScore?: number

  /**
   * What to do when the wallet has no cached score yet.
   * - 'allow'  — let the request through, fetch score async for next time (default)
   * - 'reject' — return 403 until the wallet has been scored
   */
  onUnknown?: 'allow' | 'reject'

  /**
   * Extract the paying wallet address from the Hono context.
   * If omitted, the middleware tries:
   *   1. c.get('x402PayerAddress')  — set by some x402 middleware
   *   2. X-Agent-Wallet header
   *   3. ?wallet query param
   */
  getWallet?: (c: Context) => string | null | undefined

  /**
   * DJD Agent Score API base URL.
   * Default: https://djdagentscore.xyz
   */
  apiUrl?: string

  /**
   * Local in-process cache TTL in milliseconds.
   * Avoids hitting the score API on every request for known wallets.
   * Default: 300_000 (5 minutes)
   */
  cacheTtl?: number
}

interface CacheEntry {
  score: number
  tier: string
  recommendation: string
  ts: number
}

interface ScoreApiResponse {
  score: number
  tier: string
  recommendation: string
  confidence: number
}

// ---------- Middleware ----------

const DEFAULT_API_URL = 'https://djdagentscore.xyz'

export function agentScoreGate(options: AgentScoreOptions = {}): MiddlewareHandler {
  const {
    minScore = 0,
    onUnknown = 'allow',
    getWallet,
    apiUrl = DEFAULT_API_URL,
    cacheTtl = 300_000,
  } = options

  const cache = new Map<string, CacheEntry>()

  function getFromCache(wallet: string): CacheEntry | null {
    const entry = cache.get(wallet.toLowerCase())
    if (!entry) return null
    if (Date.now() - entry.ts > cacheTtl) {
      cache.delete(wallet.toLowerCase())
      return null
    }
    return entry
  }

  function setCache(wallet: string, data: Omit<CacheEntry, 'ts'>) {
    cache.set(wallet.toLowerCase(), { ...data, ts: Date.now() })
  }

  async function fetchScore(wallet: string): Promise<ScoreApiResponse | null> {
    try {
      const res = await fetch(
        `${apiUrl}/v1/score/basic?wallet=${encodeURIComponent(wallet)}`,
        { signal: AbortSignal.timeout(10_000) },
      )
      if (!res.ok) return null
      return await res.json() as ScoreApiResponse
    } catch {
      return null
    }
  }

  function extractWallet(c: Context): string | null {
    if (getWallet) return getWallet(c) ?? null
    return (
      (c.get('x402PayerAddress') as string | undefined) ??
      c.req.header('x-agent-wallet') ??
      c.req.query('wallet') ??
      null
    )
  }

  return async (c: Context, next) => {
    const wallet = extractWallet(c)

    if (!wallet) {
      // No wallet identifiable — pass through silently
      await next()
      return
    }

    const cached = getFromCache(wallet)

    if (cached) {
      // Score is known — enforce threshold before serving
      if (minScore > 0 && cached.score < minScore) {
        return c.json(
          {
            error: 'agent_score_too_low',
            score: cached.score,
            tier: cached.tier,
            minRequired: minScore,
            improve: `${apiUrl}/v1/agent/register`,
          },
          403,
        )
      }

      c.header('X-Agent-Score', String(cached.score))
      c.header('X-Agent-Tier', cached.tier)
      c.header('X-Agent-Recommendation', cached.recommendation)
      await next()
      return
    }

    // Unknown wallet — fire async fetch to warm the cache for next request
    fetchScore(wallet)
      .then(data => {
        if (data) setCache(wallet, { score: data.score, tier: data.tier, recommendation: data.recommendation })
      })
      .catch(() => { /* best-effort */ })

    if (onUnknown === 'reject') {
      return c.json(
        {
          error: 'agent_score_unknown',
          message: 'This wallet has not been scored yet. Try again in a few seconds.',
          scoreUrl: `${apiUrl}/v1/score/basic?wallet=${encodeURIComponent(wallet)}`,
        },
        403,
      )
    }

    // Allow through, tag as unscored so callers can handle it downstream
    c.header('X-Agent-Score', 'unscored')
    c.header('X-Agent-Tier', 'Unknown')
    await next()
  }
}
