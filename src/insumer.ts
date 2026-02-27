import type { VerifyResult } from 'insumer-verify'
import { verifyAttestation } from 'insumer-verify'
import { log } from './logger.js'

// ---------- Config ----------

const INSUMER_API_URL = process.env.INSUMER_API_URL ?? 'https://api.insumermodel.com'
const INSUMER_API_KEY = process.env.INSUMER_API_KEY ?? ''

// ── v2.4 Multi-chain attestation conditions ──────────────────────────────────
// 5 conditions checked in a single /v1/attest call (1 credit = $0.04 total).
// Each condition attests: "wallet holds ≥ threshold of token on chain".
// InsumerAPI returns a signed boolean per condition — no balances revealed.

interface AttestCondition {
  contract: string
  chain: number
  method: 'balanceOf'
  args?: string[] // populated with wallet at call time
  comparison: '>='
  threshold: string
  label: string
}

const ATTEST_CONDITIONS: AttestCondition[] = [
  {
    contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chain: 8453,
    method: 'balanceOf',
    comparison: '>=',
    threshold: '0',
    label: 'usdc_base',
  },
  {
    contract: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
    chain: 1,
    method: 'balanceOf',
    comparison: '>=',
    threshold: '1',
    label: 'ens',
  },
  {
    contract: '0x4200000000000000000000000000000000000042',
    chain: 10,
    method: 'balanceOf',
    comparison: '>=',
    threshold: '1',
    label: 'op',
  },
  {
    contract: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    chain: 42161,
    method: 'balanceOf',
    comparison: '>=',
    threshold: '1',
    label: 'arb',
  },
  {
    contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    chain: 1,
    method: 'balanceOf',
    comparison: '>=',
    threshold: '0',
    label: 'steth',
  },
]

/** Freshness window: reject attestations with block timestamps older than 5 min */
const MAX_AGE_SECONDS = 300

// ---------- Types ----------

/** Per-condition pass/fail results keyed by condition label. */
export type ConditionResults = Record<string, boolean>

export interface AttestationResult {
  /** Whether the attestation was fetched and verified successfully */
  verified: boolean
  /** The attestation ID from InsumerAPI, if available */
  attestationId: string | null
  /** Whether ALL conditions passed (backward compat) */
  conditionMet: boolean
  /** Per-condition pass/fail map (v2.4) */
  conditions: ConditionResults
  /** How many conditions passed out of total */
  conditionsPassed: number
  /** Total conditions checked */
  conditionsTotal: number
  /** Individual check results from insumer-verify */
  checks: VerifyResult['checks'] | null
  /** Whether Merkle proof was requested and available */
  merkleProof: boolean
  /** Error message if attestation failed */
  error: string | null
}

const EMPTY_CONDITIONS: ConditionResults = Object.fromEntries(ATTEST_CONDITIONS.map((c) => [c.label, false]))

const EMPTY_RESULT: AttestationResult = {
  verified: false,
  attestationId: null,
  conditionMet: false,
  conditions: EMPTY_CONDITIONS,
  conditionsPassed: 0,
  conditionsTotal: ATTEST_CONDITIONS.length,
  checks: null,
  merkleProof: false,
  error: null,
}

// ---------- Public API ----------

/**
 * Fetches an InsumerAPI attestation for a wallet and verifies it client-side
 * using insumer-verify (ECDSA P-256 signature, condition hash integrity,
 * block freshness, and attestation expiry).
 *
 * v2.4: Sends 5 multi-chain conditions in a single request (1 credit = $0.04).
 * Each condition returns a signed boolean — no balances revealed.
 * Merkle attestations (2 credits) include EIP-1186 storage proofs.
 *
 * Returns per-condition results that the Identity dimension scores individually.
 */
export async function fetchAndVerifyAttestation(
  wallet: `0x${string}`,
  options: { merkle?: boolean } = {},
): Promise<AttestationResult> {
  if (!INSUMER_API_KEY) {
    return { ...EMPTY_RESULT, error: 'INSUMER_API_KEY not configured' }
  }

  try {
    // ── Step 1: Build multi-chain condition array ────────────────────────
    const conditions = ATTEST_CONDITIONS.map((c) => ({
      contract: c.contract,
      chain: c.chain,
      method: c.method,
      args: [wallet],
      comparison: c.comparison,
      threshold: c.threshold,
    }))

    const body = {
      conditions,
      ...(options.merkle ? { proof: 'merkle' } : {}),
    }

    // ── Step 2: Call /v1/attest ──────────────────────────────────────────
    const res = await fetch(`${INSUMER_API_URL}/v1/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INSUMER_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      await res.text().catch(() => 'unknown')
      log.warn('insumer', `InsumerAPI attest call failed: HTTP ${res.status}`)
      return { ...EMPTY_RESULT, error: `InsumerAPI HTTP ${res.status}` }
    }

    const raw = await res.json()

    // ── Step 3: Verify the response client-side ─────────────────────────
    const verification = await verifyAttestation(raw, { maxAge: MAX_AGE_SECONDS })

    const attestation = raw?.data?.attestation
    const attestationId: string | null = attestation?.id ?? null

    // Parse per-condition results from the attestation response.
    // InsumerAPI returns `results` as an array of booleans matching the input order.
    const rawResults: boolean[] = attestation?.results ?? []
    const conditionMap: ConditionResults = {}
    for (let i = 0; i < ATTEST_CONDITIONS.length; i++) {
      conditionMap[ATTEST_CONDITIONS[i].label] = rawResults[i] ?? false
    }
    const passed = Object.values(conditionMap).filter(Boolean).length
    // `pass` is the top-level AND of all conditions — we keep it for backward compat
    const allPassed: boolean = attestation?.pass ?? false

    if (!verification.valid) {
      log.warn('insumer', `Attestation verification failed (id=${attestationId})`)
      return {
        verified: false,
        attestationId,
        conditionMet: allPassed,
        conditions: conditionMap,
        conditionsPassed: passed,
        conditionsTotal: ATTEST_CONDITIONS.length,
        checks: verification.checks,
        merkleProof: !!options.merkle,
        error: `Verification failed: ${describeFailures(verification)}`,
      }
    }

    log.info('insumer', `Attestation verified (id=${attestationId}, passed=${passed}/${ATTEST_CONDITIONS.length})`)

    return {
      verified: true,
      attestationId,
      conditionMet: allPassed,
      conditions: conditionMap,
      conditionsPassed: passed,
      conditionsTotal: ATTEST_CONDITIONS.length,
      checks: verification.checks,
      merkleProof: !!options.merkle,
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('insumer', `Attestation error: ${msg}`)
    return { ...EMPTY_RESULT, error: msg }
  }
}

// ---------- Helpers ----------

function describeFailures(result: VerifyResult): string {
  const fails: string[] = []
  if (!result.checks.signature.passed) fails.push('signature')
  if (!result.checks.conditionHashes.passed) fails.push('conditionHashes')
  if (!result.checks.freshness.passed) fails.push('freshness')
  if (!result.checks.expiry.passed) fails.push('expiry')
  return fails.join(', ')
}
