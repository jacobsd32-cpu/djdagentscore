/** Ethereum address (0x-prefixed, 40 hex chars). */
export type Address = `0x${string}`

export type Tier = 'Elite' | 'Trusted' | 'Established' | 'Emerging' | 'Unverified'

export type DataSource = 'live' | 'cached' | 'unavailable'

export interface BasicScoreResponse {
  wallet: Address
  score: number
  tier: Tier
  confidence: number
  recommendation: string
  modelVersion: string
  lastUpdated: string
  computedAt: string
  scoreFreshness: number
  dataSource: DataSource
  stale?: boolean
  freeTier?: boolean
  freeQueriesRemainingToday?: number
}

export interface ScoreHistoryEntry {
  score: number
  calculatedAt: string
  modelVersion?: string
}

export interface DimensionData {
  score: number
  data: Record<string, unknown>
}

export interface ScoreDimensions {
  reliability: DimensionData
  viability: DimensionData
  identity: DimensionData
  capability: DimensionData
  behavior?: DimensionData
}

export interface DataAvailability {
  transactionHistory: string
  walletAge: string
  economicData: string
  identityData: string
  communityData: string
}

export interface FullScoreResponse extends BasicScoreResponse {
  sybilFlag: boolean
  gamingIndicators: string[]
  dimensions: ScoreDimensions
  dataAvailability: DataAvailability
  improvementPath?: string[]
  scoreHistory: ScoreHistoryEntry[]
  integrityMultiplier?: number
  breakdown?: Record<string, Record<string, number>>
  scoreRange?: { low: number; high: number }
  topContributors?: string[]
  topDetractors?: string[]
}

export interface LeaderboardEntry {
  rank: number
  wallet: string
  score: number
  tier: Tier
  daysAlive: number
  isRegistered: boolean
  githubVerified: boolean
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
  totalAgentsScored: number
  totalAgentsRegistered: number
  lastUpdated: string
}

export interface ReportBody {
  target: string
  reporter: string
  reason: 'failed_delivery' | 'payment_fraud' | 'impersonation' | 'malicious_behavior' | 'other'
  details: string
}

export interface ReportResponse {
  reportId: string
  status: string
  targetCurrentScore: number
  penaltyApplied: number
}

export interface AgentRegistrationBody {
  wallet: string
  name?: string
  description?: string
  github_url?: string
  website_url?: string
}

export interface AgentRegistrationResponse {
  wallet: Address
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

export interface ComputeJobResponse {
  jobId: string
  wallet: Address
  status: 'queued' | 'processing' | 'complete' | 'error'
  result?: FullScoreResponse
  error?: string
  createdAt: string
  completedAt?: string
}

export interface EconomyMetrics {
  period: string
  limit: number
  count: number
  metrics: Array<Record<string, unknown>>
}

export interface ApiError {
  error: string
  message?: string
  upgrade?: Record<string, unknown>
}

export interface ClientOptions {
  /** Base URL of the DJD Agent Score API (e.g., "https://djd-agent-score.fly.dev") */
  baseUrl: string
  /** Optional x402 payment header generator. Called before paid requests. */
  paymentHeaderProvider?: (endpoint: string, price: string) => Promise<string> | string
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number
  /** Max retries on 5xx or network error (default: 2) */
  maxRetries?: number
  /** Custom fetch implementation (default: globalThis.fetch) */
  fetch?: typeof globalThis.fetch
}
