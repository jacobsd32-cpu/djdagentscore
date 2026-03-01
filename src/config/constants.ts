/**
 * Centralized configuration constants.
 *
 * All magic numbers that were previously scattered across route handlers,
 * middleware, and job files live here. Grouped by domain so related values
 * are easy to find and tune together.
 */

// ── Endpoint Pricing (USDC via x402) ────────────────────────────────────────

/** Maps API path → price in USDC. Used by both x402 middleware and query logger. */
export const ENDPOINT_PRICING: Record<string, number> = {
  '/v1/score/full': 0.1,
  '/v1/score/refresh': 0.25,
  '/v1/report': 0.02,
  '/v1/data/fraud/blacklist': 0.05,
  '/v1/score/batch': 0.5,
  '/v1/score/history': 0.15,
  '/v1/certification/apply': 99.0,
}

// ── Tier Configuration ──────────────────────────────────────────────────────

/** Default tier score thresholds (can be overridden by auto-recalibration). */
export const DEFAULT_TIER_THRESHOLDS = {
  Elite: 90,
  Trusted: 75,
  Established: 50,
  Emerging: 25,
} as const

/** Tier → color mapping for SVG badges. */
export const TIER_COLORS: Record<string, string> = {
  Elite: '#d97706',
  Trusted: '#2563eb',
  Established: '#059669',
  Emerging: '#7c3aed',
  Unverified: '#6b7280',
}

// ── Report & Penalty ────────────────────────────────────────────────────────

export const REPORT_CONFIG = {
  /** Points deducted from target's score per report */
  PENALTY_PER_REPORT: 5,
  /** Max reports a single reporter can file against one target */
  MAX_REPORTS_PER_PAIR: 3,
  /** Max characters for report details field */
  MAX_DETAILS_LENGTH: 1000,
} as const

// ── Rate Limiting ───────────────────────────────────────────────────────────

export const RATE_LIMIT_CONFIG = {
  /** Free tier: max basic score lookups per day per IP */
  FREE_DAILY_LIMIT: 10,
  /** Paid tier: max requests per hour per payer wallet */
  MAX_REQUESTS_PER_HOUR: 120,
} as const

// ── Scoring Engine ──────────────────────────────────────────────────────────

export const SCORING_CONFIG = {
  /** Timeout for user-initiated score computation (ms) */
  COMPUTE_TIMEOUT_MS: 75_000,
  /** Max concurrent background refresh jobs */
  MAX_CONCURRENT_BG_REFRESHES: 5,
  /** Score TTL before considered stale (ms) */
  SCORE_TTL_MS: 60 * 60 * 1000, // 1 hour
} as const

// ── Background Job Scheduling ───────────────────────────────────────────────

export const JOB_INTERVALS = {
  /** Score refresh: runs once per hour */
  HOURLY_REFRESH_MS: 60 * 60 * 1000,
  /** Intent matcher: runs every 6 hours */
  INTENT_MATCHER_MS: 6 * 60 * 60 * 1000,
  /** Outcome matcher: runs every 6 hours */
  OUTCOME_MATCHER_MS: 6 * 60 * 60 * 1000,
  /** Auto-recalibration: runs every 6 hours */
  AUTO_RECALIBRATION_MS: 6 * 60 * 60 * 1000,
  /** Anomaly detector: runs every 15 minutes */
  ANOMALY_DETECTOR_MS: 15 * 60 * 1000,
  /** Sybil monitor: runs every 5 minutes */
  SYBIL_MONITOR_MS: 5 * 60 * 1000,
  /** Daily aggregator: checked every hour (runs once per day) */
  DAILY_AGGREGATOR_MS: 60 * 60 * 1000,
  /** Webhook delivery: processes queue every 30 seconds */
  WEBHOOK_DELIVERY_MS: 30_000,
  /** ERC-8004 reputation publisher: runs every 4 hours */
  REPUTATION_PUBLISHER_MS: 4 * 60 * 60 * 1000,
} as const

/** Staggered startup delays to avoid thundering herd on boot */
export const JOB_STARTUP_DELAYS = {
  /** Let server serve health checks & requests before indexing starts */
  BLOCKCHAIN_INDEXER_MS: 10_000,
  USDC_INDEXER_MS: 45_000,
  INTENT_MATCHER_MS: 60_000,
  OUTCOME_MATCHER_MS: 90_000,
  AUTO_RECALIBRATION_MS: 120_000,
  REPUTATION_PUBLISHER_MS: 150_000,
} as const

export const JOB_CONFIG = {
  /** Score refresh: wallets per batch */
  REFRESH_BATCH_SIZE: 50,
  /** Delay between wallet refreshes to avoid RPC throttling (ms) */
  INTER_WALLET_DELAY_MS: 200,
  /** Graceful shutdown timeout (ms) */
  SHUTDOWN_TIMEOUT_MS: 10_000,
} as const

// ── Webhook Delivery ────────────────────────────────────────────────────────

export const WEBHOOK_CONFIG = {
  MAX_ATTEMPTS: 3,
  RETRY_DELAYS_MS: [60_000, 300_000] as readonly number[],
  MAX_CONSECUTIVE_FAILURES: 5,
  DELIVERY_BATCH_SIZE: 50,
} as const

// ── Score Queue ─────────────────────────────────────────────────────────────

export const SCORE_QUEUE_CONFIG = {
  /** Time-to-live for a queued job before cleanup (ms) */
  JOB_TTL_MS: 10 * 60 * 1000,
  /** How often to clean up expired jobs (ms) */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
  /** Max concurrent scoring jobs */
  MAX_CONCURRENT_JOBS: 1,
  /** Max pending jobs in queue */
  MAX_PENDING_JOBS: 50,
} as const

// ── Blockchain Indexer (x402 payments) ──────────────────────────────────

export const BLOCKCHAIN_INDEXER_CONFIG = {
  /** Blocks to backfill on first run (~28h at 2s/block) */
  BACKFILL_BLOCKS: 50_000n,
  /** x402 micro-payment cap — transfers above this are DeFi noise */
  MAX_X402_AMOUNT_USDC: 1.0,
  /** Seconds between tip polls */
  POLL_INTERVAL_MS: 12_000,
  /** Delay on RPC error before retry */
  RETRY_DELAY_MS: 30_000,
  /** Blocks per getLogs call (reduced for Base's high volume) */
  LOG_CHUNK_SIZE: 500n,
  /** Event loop yield between chunks so health checks can be served */
  EVENT_LOOP_YIELD_MS: 100,
  /** Max gap to index on startup — skip to current if further behind */
  MAX_CATCHUP_BLOCKS: 43_200n,
  /** SQLite micro-batch size for INSERT transactions */
  MICRO_BATCH_SIZE: 50,
} as const

// ── USDC Transfer Indexer ───────────────────────────────────────────────

export const USDC_INDEXER_CONFIG = {
  /** Seconds between tip polls */
  POLL_INTERVAL_MS: 15_000,
  /** Delay on RPC error before retry */
  RETRY_DELAY_MS: 30_000,
  /** Blocks per getLogs call (reduced to limit transfers per cycle) */
  LOG_CHUNK_SIZE: 50n,
  /** ~5 getLogs/sec to avoid rate limits */
  RATE_LIMIT_DELAY_MS: 200,
  /** Max gap to index on startup (~12h at 2s/block) */
  MAX_CATCHUP_BLOCKS: 21_600n,
  /** Cap expensive wallet stats refresh per chunk */
  MAX_WALLET_REFRESH_PER_CHUNK: 3,
  /** SQLite micro-batch size to avoid blocking the event loop */
  MICRO_BATCH_SIZE: 50,
  /** Event loop yield between micro-batches (ms) */
  EVENT_LOOP_YIELD_MS: 50,
  /** Blocks behind tip at which we skip wallet stats refresh */
  CATCHUP_THRESHOLD: 50n,
} as const

// ── Reputation Publisher ────────────────────────────────────────────────

export const REPUTATION_PUBLISHER_CONFIG = {
  /** Min confidence to publish on-chain */
  MIN_CONFIDENCE: 0.5,
  /** Min score delta to trigger re-publication */
  SCORE_DELTA: 5,
  /** Max scores to publish per run */
  BATCH_LIMIT: 10,
  /** Timeout waiting for on-chain tx confirmation */
  TX_TIMEOUT_MS: 60_000,
  /** Delay between on-chain transactions */
  INTER_TX_DELAY_MS: 3_000,
  /** Min ETH balance required to publish (0.001 ETH) */
  MIN_ETH_BALANCE: 1_000_000_000_000_000n,
  /** Full score endpoint URL embedded in on-chain record */
  SCORE_ENDPOINT: 'https://agentscore.ai/v1/score/full',
} as const

// ── Anomaly Detector ────────────────────────────────────────────────────

export const ANOMALY_DETECTOR_CONFIG = {
  /** Score change (points) to trigger an anomaly */
  SCORE_CHANGE_THRESHOLD: 10,
  /** Score change (points) for "high" severity classification */
  HIGH_SEVERITY_THRESHOLD: 20,
  /** Balance ratio below which triggers freefall alert (50% drop) */
  BALANCE_FREEFALL_RATIO: 0.5,
  /** Lookback window for score changes and reports (minutes) */
  LOOKBACK_MINUTES: 15,
  /** Lookback window for new sybil flags (minutes) */
  SYBIL_CHECK_MINUTES: 5,
  /** Max sybil wallets to check per run */
  SYBIL_WALLET_LIMIT: 500,
} as const

// ── GitHub Re-Verification ──────────────────────────────────────────────

export const GITHUB_REVERIFY_CONFIG = {
  /** Delay between GitHub API calls to stay within rate limits */
  INTER_CALL_DELAY_MS: 2_000,
} as const

// ── API Limits ──────────────────────────────────────────────────────────────

export const API_CONFIG = {
  /** Max request body size */
  MAX_BODY_SIZE: 100 * 1024, // 100 KB
  /** Max wallets per batch request */
  MAX_BATCH_SIZE: 20,
  /** Default server port */
  DEFAULT_PORT: 3000,
} as const

// ── Dimension Scoring ─────────────────────────────────────────────────────
// Breakpoint tables and point allocations for each scoring dimension.
// Tuning these adjusts the scoring curves without touching algorithmic logic.
// Piecewise arrays are [input, output] sorted ascending for piecewiseLog().

/** Weighted contribution of each dimension to the composite score. */
export const DIMENSION_WEIGHTS = {
  reliability: 0.3,
  viability: 0.25,
  identity: 0.2,
  behavior: 0.15,
  capability: 0.1,
} as const

/** Base blocks-per-day on Base L2 (1 block / 2 seconds). */
export const BLOCKS_PER_DAY = 43_200
export const BLOCKS_PER_HOUR = 1_800

export const RELIABILITY_BREAKPOINTS = {
  /** Total USDC transfer count → points (max 25). */
  txCount: [
    [0, 0],
    [5, 4],
    [25, 10],
    [100, 18],
    [500, 23],
    [1000, 25],
  ] as ReadonlyArray<[number, number]>,
  /** Total nonce (all txs sent) → points (max 20). */
  nonce: [
    [0, 0],
    [1, 3],
    [10, 8],
    [50, 14],
    [200, 18],
    [1000, 20],
  ] as ReadonlyArray<[number, number]>,
  /** Payment success rate: base pts when any tx exists, bonuses at thresholds. */
  successRate: { BASE: 15, REPEAT_BONUS: 10, REPEAT_THRESHOLD: 5, PROVEN_BONUS: 5, PROVEN_THRESHOLD: 20, MAX: 30 },
  /** Uptime window in days over which first→last block span is measured. */
  uptimeWindowDays: 14,
  /** Max points for uptime signal. */
  uptimeMaxPts: 25,
  /** Recency tiers: [maxBlocksAgo, points] checked in order. */
  recency: [
    [BLOCKS_PER_HOUR * 24, 20], // <24h
    [BLOCKS_PER_HOUR * 24 * 7, 15], // <7d
    [BLOCKS_PER_HOUR * 24 * 30, 5], // <30d
  ] as ReadonlyArray<[number, number]>,
} as const

export const VIABILITY_BREAKPOINTS = {
  /** ETH balance thresholds (descending): [minEth, points]. Max 15 pts. */
  ethBalance: [
    [0.1, 15],
    [0.01, 10],
    [0.001, 5],
    [0, 2],
  ] as ReadonlyArray<[number, number]>,
  /** USDC balance thresholds (descending): [minUsd, points]. Max 25 pts. */
  usdcBalance: [
    [100, 25],
    [50, 22],
    [25, 18],
    [10, 15],
    [5, 10],
    [1, 5],
    [0.1, 2],
  ] as ReadonlyArray<[number, number]>,
  /** Income/burn ratio thresholds (descending): [minRatio, points]. Max 30 pts. */
  incomeRatio: [
    [2, 30],
    [1.5, 25],
    [1, 15],
  ] as ReadonlyArray<[number, number]>,
  /** Fallback when outflows=0 but inflows>0. */
  pureIncomePts: 30,
  /** Fallback when ratio < lowest threshold. */
  burningPts: 5,
  /** Wallet age → points (ascending, for piecewiseLog). Max 30 pts. */
  walletAge: [
    [0, 0],
    [1, 5],
    [7, 15],
    [30, 25],
    [90, 30],
  ] as ReadonlyArray<[number, number]>,
  /** Penalty for ever-zero-balance wallets. */
  zeroBalancePenalty: -15,
  /** 7-day trend scoring. */
  trend: { RISING: 15, STABLE: 10, DECLINING: 5, FREEFALL_THRESHOLD: -50 },
} as const

export const IDENTITY_BREAKPOINTS = {
  registrationPts: 10,
  basenamePts: 15,
  githubVerifiedPts: 25,
  /** GitHub activity: stars and push recency. Max 15 pts combined. */
  githubActivity: {
    STARS_HIGH_THRESHOLD: 5,
    STARS_HIGH_PTS: 5,
    STARS_LOW_THRESHOLD: 1,
    STARS_LOW_PTS: 3,
    RECENT_PUSH_DAYS: 30,
    RECENT_PUSH_PTS: 10,
    STALE_PUSH_DAYS: 90,
    STALE_PUSH_PTS: 5,
  },
  insumerPtsPerCondition: 3,
  /** Wallet age cliffs (descending): [minDays, points]. Max 20 pts. */
  walletAge: [
    [180, 20],
    [90, 17],
    [60, 15],
    [30, 12],
    [14, 9],
    [7, 5],
    [3, 3],
  ] as ReadonlyArray<[number, number]>,
  /** Points when age <= min threshold. */
  walletAgeMinPts: 1,
} as const

export const CAPABILITY_BREAKPOINTS = {
  /** Total revenue → points (ascending, for piecewiseLog). Max 35 pts. */
  revenue: [
    [0, 0],
    [0.1, 3],
    [1, 8],
    [10, 16],
    [50, 23],
    [200, 30],
    [500, 35],
  ] as ReadonlyArray<[number, number]>,
  /** Unique counterparties → points (ascending, for piecewiseLog). Max 15 pts. */
  counterparties: [
    [0, 0],
    [1, 3],
    [3, 7],
    [5, 10],
    [10, 13],
    [20, 15],
  ] as ReadonlyArray<[number, number]>,
  /** Service longevity days → points (ascending, for piecewiseLog). Max 15 pts. */
  longevity: [
    [0, 0],
    [1, 3],
    [7, 7],
    [14, 10],
    [30, 13],
    [60, 15],
  ] as ReadonlyArray<[number, number]>,
  /** x402 service count thresholds (descending): [minTxCount, serviceCount]. */
  x402ServiceThresholds: [
    [50, 4],
    [20, 3],
    [5, 2],
  ] as ReadonlyArray<[number, number]>,
  /** Service count → points when real x402 data is available. */
  x402PtsWithData: { 4: 35, 3: 28, 2: 18, 1: 9, 0: 0 } as Record<number, number>,
  /** Service count → points from heuristic fallback. */
  x402PtsHeuristic: { 4: 35, 3: 28, 2: 20, 1: 10, 0: 0 } as Record<number, number>,
  /** Avg inflow threshold to distinguish x402 micropayments from regular transfers. */
  x402AvgInflowThreshold: 5,
} as const

export const BEHAVIOR_BREAKPOINTS = {
  /** Inter-arrival CV scoring range. */
  cv: { MIN: 0.1, RANGE: 1.4, MAX_PTS: 35 },
  /** Hourly entropy scoring range. */
  entropy: { MIN: 1.0, RANGE: 2.5, MAX_PTS: 35 },
  /** Max gap (hours) scoring range. */
  maxGap: { MIN_HOURS: 1, RANGE_HOURS: 47, MAX_PTS: 30 },
  /** Score → classification thresholds (descending). */
  classification: { ORGANIC: 70, MIXED: 45, AUTOMATED: 25 },
  /** Score assigned when <2 timestamps. */
  insufficientDataScore: 50,
  /** Min timestamps for full behavior scoring (below this, partial scoring applies). */
  minFullTimestamps: 5,
  /** Blend divisor for partial scoring: weight = (length - 1) / divisor. */
  partialBlendDivisor: 4,
} as const

// ---------------------------------------------------------------------------
// Trajectory (Phase 4.5 — score history trend modifier)
// ---------------------------------------------------------------------------

export const TRAJECTORY_CONFIG = {
  /** Minimum history entries before applying any modifier. */
  MIN_DATA_POINTS: 3,
  /** Consecutive streak length for ±5 modifier (requires matching velocity). */
  STRONG_STREAK: 10,
  /** Consecutive streak length for ±3 modifier. */
  MODERATE_STREAK: 5,
  /** Velocity (pts/day) threshold for strong trend. */
  VELOCITY_STRONG: 1.0,
  /** Velocity (pts/day) threshold for moderate trend. */
  VELOCITY_MODERATE: 0.5,
  /** Volatility (stdev) below this = stable (earns +1 bonus). */
  STABILITY_THRESHOLD: 5,
  /** Volatility (stdev) above this = volatile direction. */
  VOLATILE_THRESHOLD: 15,
  /** Absolute cap on trajectory modifier. */
  MAX_MODIFIER: 5,
} as const

// ---------------------------------------------------------------------------
// Population-Relative Adaptive Breakpoints (Phase 2)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Outcome-Driven Adaptive Weights (Phase 3)
// ---------------------------------------------------------------------------

export const ADAPTIVE_WEIGHTS_CONFIG = {
  /** Minimum outcome rows (with dimension scores) before weight learning activates. */
  MIN_OUTCOMES: 50,
  /** Minimum negative outcomes (fraud, no_activity) required. */
  MIN_NEGATIVE: 5,
  /** Max weight change per dimension per 6h recalibration cycle. */
  MAX_SHIFT_PER_RUN: 0.02,
  /** Max total deviation from default weight per dimension. */
  MAX_TOTAL_DRIFT: 0.05,
} as const

// ---------------------------------------------------------------------------
// Population-Relative Adaptive Breakpoints (Phase 2)
// ---------------------------------------------------------------------------

export const POPULATION_CONFIG = {
  /** Minimum scored wallets before adaptive breakpoints activate. */
  MIN_SAMPLE_SIZE: 50,
  /** Maximum ratio by which a breakpoint input threshold can shift upward. */
  MAX_SHIFT_RATIO: 0.3,
  /** Dimension median score below which maturity factor = 0 (early ecosystem). */
  MATURITY_BASELINE: 25,
  /** Dimension median score at which maturity factor = 1 (mature ecosystem). */
  MATURITY_CEILING: 65,
} as const

// ---------------------------------------------------------------------------
// Confidence-Weighted Dampening (Phase 4)
// ---------------------------------------------------------------------------

export const DAMPENING_CONFIG = {
  /** Max score swing allowed at confidence = 0.0 (low data, free to move). */
  MAX_DELTA_LOW_CONF: 30,
  /** Max score swing allowed at confidence = 1.0 (high data, sticky). */
  MAX_DELTA_HIGH_CONF: 8,
} as const
