export type Address = `0x${string}`

/** Type guard: validates a 0x-prefixed, 40-hex-char Ethereum address. */
export function isValidAddress(addr: string): addr is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

export type Tier = 'Elite' | 'Trusted' | 'Established' | 'Emerging' | 'Unverified'

export type ReportReason =
  | 'failed_delivery'
  | 'payment_fraud'
  | 'impersonation'
  | 'malicious_behavior'
  | 'other'

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
}

export interface CapabilityData {
  activeX402Services: number
  totalRevenue: string
  domainsOwned: number
  successfulReplications: number
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
  github_verified: number        // 0 | 1
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
  is_registered: number        // 0 | 1
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
