/**
 * DJD Agent Score — Reference Integration Demo
 *
 * Shows how an AI agent integrates with the DJD Agent Score API:
 *   1. Registers a wallet via POST /v1/agent/register  (free)
 *   2. Fetches its own score via GET /v1/score/basic   (free tier: 10/day/IP)
 *   3. Prints a formatted score card to stdout
 *
 * Usage:
 *   npx tsx examples/demo-agent.ts
 *
 * Environment variables (all optional):
 *   DJD_API_URL       — API base URL  (default: https://djd-agent-score.life.conway.tech)
 *   AGENT_WALLET      — Wallet address (default: 0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528)
 *   AGENT_GITHUB_URL  — GitHub URL to include in registration
 *   AGENT_WEBSITE_URL — Website URL to include in registration
 *
 * No extra dependencies — uses Node 18+ built-in fetch.
 */

// ---------- Config ----------

const API_URL = (
  process.env.DJD_API_URL ?? 'https://djd-agent-score.life.conway.tech'
).replace(/\/$/, '')

const WALLET =
  process.env.AGENT_WALLET ?? '0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528'

const GITHUB_URL = process.env.AGENT_GITHUB_URL
const WEBSITE_URL = process.env.AGENT_WEBSITE_URL

// ---------- Types (mirrors src/types.ts) ----------

interface AgentRegistrationResponse {
  wallet: string
  status: 'registered' | 'updated'
  registeredAt: string
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
  github_verified: boolean
  github_stars: number | null
  github_pushed_at: string | null
}

interface BasicScoreResponse {
  wallet: string
  score: number
  tier: string
  confidence: number
  recommendation: string
  modelVersion: string
  lastUpdated: string
  stale?: boolean
}

interface ApiError {
  error: string
}

// ---------- Helpers ----------

function shortWallet(addr: string): string {
  return addr.slice(0, 10) + '...'
}

// ---------- Main ----------

console.log('=== DJD Agent Score Demo ===\n')

// Step 1: Register
console.log(`[1/2] Registering wallet ${shortWallet(WALLET)}`)

const registerBody: Record<string, string> = {
  wallet: WALLET,
  name: 'Demo Agent',
  description: 'Reference integration demo for DJD Agent Score',
}
if (GITHUB_URL) registerBody.github_url = GITHUB_URL
if (WEBSITE_URL) registerBody.website_url = WEBSITE_URL

let regData: AgentRegistrationResponse

try {
  const regRes = await fetch(`${API_URL}/v1/agent/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerBody),
  })

  if (!regRes.ok) {
    const errBody = (await regRes.json().catch(() => ({ error: regRes.statusText }))) as ApiError
    console.error(`  Error: HTTP ${regRes.status} — ${errBody.error}`)
    process.exit(1)
  }

  regData = (await regRes.json()) as AgentRegistrationResponse
} catch (err) {
  console.error(`  Error: Could not reach API at ${API_URL}`)
  console.error(`  ${(err as Error).message}`)
  process.exit(1)
}

console.log(
  `  \u2713 Status: ${regData.status}  (first registered: ${regData.registeredAt})`,
)

// Step 2: Fetch score
console.log('\n[2/2] Fetching score...')

let scoreData: BasicScoreResponse

try {
  const scoreRes = await fetch(
    `${API_URL}/v1/score/basic?wallet=${encodeURIComponent(WALLET)}`,
  )

  if (scoreRes.status === 402) {
    console.error(
      '  Error: Free tier exhausted (10 calls/day/IP). Provide an X-PAYMENT header or try again tomorrow.',
    )
    process.exit(1)
  }

  if (!scoreRes.ok) {
    // The API may return a score-unavailable response (e.g. RPC still indexing)
    const errBody = (await scoreRes.json().catch(() => ({ error: scoreRes.statusText }))) as
      | ApiError
      | Partial<BasicScoreResponse>

    if ('error' in errBody && errBody.error) {
      console.error(`  Error: HTTP ${scoreRes.status} — ${errBody.error}`)
      console.error(
        '  Hint: If the RPC node is still syncing, score data may not be available yet. Retry in a few minutes.',
      )
      process.exit(1)
    }
  }

  scoreData = (await scoreRes.json()) as BasicScoreResponse
} catch (err) {
  console.error(`  Error: Could not reach API at ${API_URL}`)
  console.error(`  ${(err as Error).message}`)
  console.error(
    '  Hint: If the RPC is slow, the server may be still computing your score. Retry in a minute.',
  )
  process.exit(1)
}

const confidenceStr = scoreData.confidence.toFixed(2)
const badgeWallet = WALLET.toLowerCase()
const badgeUrl = `${API_URL}/v1/badge/${badgeWallet}.svg`

console.log(
  `  \u2713 Score: ${scoreData.score}  |  Tier: ${scoreData.tier}  |  Confidence: ${confidenceStr}`,
)
console.log(`  Recommendation: ${scoreData.recommendation}`)
if (scoreData.stale) {
  console.log('  (Score is stale — a refresh is queued in the background)')
}

console.log()
console.log(`  Badge URL: ${badgeUrl}`)
console.log(`  Embed:     ![DJD Score](${badgeUrl})`)
console.log()
console.log('Done. Share your badge URL to let others verify your agent\'s reputation.')
