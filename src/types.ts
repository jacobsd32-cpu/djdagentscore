export type Address = `0x${string}`

/** Type guard: validates a 0x-prefixed, 40-hex-char Ethereum address. */
export function isValidAddress(addr: string): addr is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

/**
 * Validates a webhook URL is safe to fetch (SSRF prevention).
 * Requires HTTPS and blocks internal/private network addresses,
 * including non-standard IP encodings (decimal, octal, hex).
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false

    const hostname = parsed.hostname.toLowerCase()

    // Block known private/internal hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localhost')
    ) {
      return false
    }

    // Block IPv6 loopback and link-local (brackets stripped by URL parser)
    if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:') || hostname.startsWith('[fe80:')) {
      return false
    }

    // Block non-standard IP encodings: pure decimal (2130706433), hex (0x7f000001),
    // octal (0177.0.0.1), or mixed forms. If the hostname is purely numeric or
    // contains hex/octal prefixes, reject it — legitimate webhooks use domain names.
    if (/^[0-9]+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname) || /^0[0-7]/.test(hostname)) {
      return false
    }

    // Block dotted-decimal private/reserved ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number) as [number, number, number, number, number]
      if (
        a === 0 || // 0.0.0.0/8 (current network)
        a === 10 || // 10.0.0.0/8 (private)
        a === 127 || // 127.0.0.0/8 (loopback)
        (a === 100 && b! >= 64 && b! <= 127) || // 100.64.0.0/10 (CGNAT)
        (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / cloud metadata)
        (a === 172 && b! >= 16 && b! <= 31) || // 172.16.0.0/12 (private)
        (a === 192 && b === 168) // 192.168.0.0/16 (private)
      ) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

export type Tier = 'Elite' | 'Trusted' | 'Established' | 'Emerging' | 'Unverified'

export type ReportReason = 'failed_delivery' | 'payment_fraud' | 'impersonation' | 'malicious_behavior' | 'other'

export const REPORT_REASONS: ReportReason[] = [
  'failed_delivery',
  'payment_fraud',
  'impersonation',
  'malicious_behavior',
  'other',
]

// ---------- Dimension raw data ----------

export interface ReliabilityData {
  txCount: number
  nonce: number
  successRate: number
  lastTxTimestamp: number | null
  failedTxCount: number
  uptimeEstimate: number
}

export interface ViabilityData {
  usdcBalance: string
  ethBalance: string
  inflows30d: string
  outflows30d: string
  inflows7d: string
  outflows7d: string
  totalInflows: string
  walletAgedays: number
  everZeroBalance: boolean
}

export interface IdentityData {
  erc8004Registered: boolean
  hasBasename: boolean
  walletAgeDays: number
  creatorScore: number | null
  generationDepth: number
  constitutionHashVerified: boolean
  /** True if at least one Insumer condition passed (backward compat). */
  insumerVerified: boolean
  /** v2.4: Per-condition attestation results (label → pass/fail). */
  insumerConditions?: Record<string, boolean>
  /** v2.4: How many attestation conditions passed. */
  insumerConditionsPassed?: number
}

export interface CapabilityData {
  activeX402Services: number
  totalRevenue: string
  domainsOwned: number
  successfulReplications: number
  uniqueCounterparties: number
  serviceLongevityDays: number
}

export type BehaviorClassification = 'organic' | 'mixed' | 'automated' | 'suspicious' | 'insufficient_data'

export interface BehaviorData {
  interArrivalCV: number
  hourlyEntropy: number
  maxGapHours: number
  classification: BehaviorClassification
  txCount: number
}

export interface ScoreDimensions {
  reliability: { score: number; data: ReliabilityData }
  viability: { score: number; data: ViabilityData }
  identity: { score: number; data: IdentityData }
  capability: { score: number; data: CapabilityData }
  behavior?: { score: number; data: BehaviorData }
}

// ---------- Data Availability ----------

export interface DataAvailability {
  transactionHistory: string
  walletAge: string
  economicData: string
  identityData: string
  communityData: string
}

// ---------- Score responses ----------

export interface BasicScoreResponse {
  wallet: Address
  score: number
  tier: Tier
  confidence: number
  recommendation: string
  modelVersion: string
  lastUpdated: string
  /** ISO-8601 timestamp of when the underlying score was computed (may differ from lastUpdated when served from cache). */
  computedAt: string
  /** 0–1 freshness factor: 1 = just computed, decays linearly toward 0 at cache expiry. Consumers can use this to weight trust. */
  scoreFreshness: number
  /** Where the score data originated: 'live' = fresh RPC computation, 'cached' = served from DB cache, 'unavailable' = blockchain data was unreachable. */
  dataSource?: 'live' | 'cached' | 'unavailable'
  stale?: boolean
}

export interface ScoreHistoryEntry {
  score: number
  calculatedAt: string
  modelVersion?: string
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
  // v2.5 flywheel enrichments
  trajectory?: {
    velocity: number | null
    momentum: number | null
    direction: 'improving' | 'declining' | 'stable' | 'volatile' | 'new'
    modifier: number
    dataPoints: number
    spanDays: number
  }
  dampening?: {
    wasDampened: boolean
    maxDelta: number
    actualDelta: number
  }
  effectiveWeights?: Record<string, number>
  percentileRank?: number
}

// ---------- DB row shapes ----------

export interface ScoreRow {
  wallet: string
  composite_score: number
  reliability_score: number
  viability_score: number
  identity_score: number
  capability_score: number
  behavior_score: number | null
  tier: string
  raw_data: string
  calculated_at: string
  expires_at: string
  confidence: number
  recommendation: string
  model_version: string
  sybil_flag: number
  sybil_indicators: string
  gaming_indicators: string
}

export interface ScoreHistoryRow {
  id: number
  wallet: string
  score: number
  calculated_at: string
  confidence: number
  model_version: string
}

export interface FraudReportRow {
  id: string
  target_wallet: string
  reporter_wallet: string
  reason: string
  details: string
  created_at: string
  penalty_applied: number
}

// ---------- Agent Registration ----------

export interface AgentRegistrationBody {
  wallet: string
  name?: string
  description?: string
  github_url?: string
  website_url?: string
}

export interface AgentRegistrationRow {
  wallet: string
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
  registered_at: string
  updated_at: string
  // GitHub verification (populated async after registration)
  github_verified: number // 0 | 1
  github_stars: number | null
  github_pushed_at: string | null
  github_verified_at: string | null
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

// ---------- Report ----------

export interface ReportBody {
  target: string
  reporter: string
  reason: ReportReason
  details: string
}

export interface ReportResponse {
  reportId: string
  status: string
  targetCurrentScore: number
  penaltyApplied: number
}

// ---------- Leaderboard ----------

export interface LeaderboardRow extends ScoreRow {
  is_registered: number // 0 | 1
  github_verified_badge: number // 0 | 1
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

// ---------- Health ----------

export interface HealthResponse {
  status: 'ok'
  version: string
  uptime: number
  cachedScores: number
}

// ---------- Blockchain data ----------

export interface TransferLog {
  from: string
  to: string
  value: bigint
  blockNumber: bigint
}

export interface WalletUSDCData {
  balance: bigint
  inflows30d: bigint
  outflows30d: bigint
  inflows7d: bigint
  outflows7d: bigint
  totalInflows: bigint
  totalOutflows: bigint
  transferCount: number
  firstBlockSeen: bigint | null
  lastBlockSeen: bigint | null
}

// ---------- Wallet Metrics (DB row) ----------

export type BalanceTrend = 'freefall' | 'declining' | 'stable' | 'rising'

export interface WalletMetricsRow {
  wallet: string
  tx_count_24h: number
  tx_count_7d: number
  tx_count_30d: number
  volume_in_24h: number
  volume_in_7d: number
  volume_in_30d: number
  volume_out_24h: number
  volume_out_7d: number
  volume_out_30d: number
  income_burn_ratio: number
  balance_trend_7d: BalanceTrend
  unique_partners_30d: number
  last_updated: string
}

// ---------- Scoring subsystem types ----------

export interface SybilResult {
  sybilFlag: boolean
  indicators: string[]
  caps: { reliability?: number; identity?: number }
}

export interface GamingResult {
  gamingDetected: boolean
  indicators: string[]
  penalties: { composite: number; reliability: number; viability: number }
  overrides: { useAvgBalance: boolean }
}
