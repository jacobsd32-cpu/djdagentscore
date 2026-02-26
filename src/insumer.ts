import { verifyAttestation } from 'insumer-verify'
import type { VerifyResult } from 'insumer-verify'
import { log } from './logger.js'

// ---------- Config ----------

const INSUMER_API_URL = process.env.INSUMER_API_URL ?? 'https://api.insumermodel.com'
const INSUMER_API_KEY = process.env.INSUMER_API_KEY ?? ''

// Base USDC contract — the condition we attest: "wallet holds ≥ 0 USDC"
// This proves the wallet interacts with the USDC contract on-chain without
// revealing any balance information (the boolean result is all we get).
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_CHAIN_ID = 8453

/** Freshness window: reject attestations with block timestamps older than 5 min */
const MAX_AGE_SECONDS = 300

// ---------- Types ----------

export interface AttestationResult {
  /** Whether the attestation was fetched and verified successfully */
  verified: boolean
  /** The attestation ID from InsumerAPI, if available */
  attestationId: string | null
  /** Whether the wallet met the attested condition */
  conditionMet: boolean
  /** Individual check results from insumer-verify */
  checks: VerifyResult['checks'] | null
  /** Whether Merkle proof was requested and available */
  merkleProof: boolean
  /** Error message if attestation failed */
  error: string | null
}

const EMPTY_RESULT: AttestationResult = {
  verified: false,
  attestationId: null,
  conditionMet: false,
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
 * Standard attestations (1 credit) return a signed boolean — no balance revealed.
 * Merkle attestations (2 credits) include EIP-1186 storage proofs for downstream
 * verification by score consumers, but reveal the raw balance to the caller.
 *
 * Returns a structured result that the Identity dimension can score.
 */
export async function fetchAndVerifyAttestation(
  wallet: `0x${string}`,
  options: { merkle?: boolean } = {},
): Promise<AttestationResult> {
  if (!INSUMER_API_KEY) {
    return { ...EMPTY_RESULT, error: 'INSUMER_API_KEY not configured' }
  }

  try {
    // ── Step 1: Call /v1/attest ──────────────────────────────────────────
    const body = {
      conditions: [
        {
          contract: BASE_USDC,
          chain: BASE_CHAIN_ID,
          method: 'balanceOf',
          args: [wallet],
          comparison: '>=',
          threshold: '0',
        },
      ],
      ...(options.merkle ? { proof: 'merkle' } : {}),
    }

    const res = await fetch(`${INSUMER_API_URL}/v1/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INSUMER_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown')
      log.warn('insumer', `InsumerAPI attest call failed: HTTP ${res.status}`)
      return { ...EMPTY_RESULT, error: `InsumerAPI HTTP ${res.status}` }
    }

    const raw = await res.json()

    // ── Step 2: Verify the response client-side ─────────────────────────
    const verification = await verifyAttestation(raw, { maxAge: MAX_AGE_SECONDS })

    const attestation = raw?.data?.attestation
    const attestationId: string | null = attestation?.id ?? null
    const conditionMet: boolean = attestation?.pass ?? false

    if (!verification.valid) {
      log.warn('insumer', `Attestation verification failed (id=${attestationId})`)
      return {
        verified: false,
        attestationId,
        conditionMet,
        checks: verification.checks,
        merkleProof: !!options.merkle,
        error: 'Verification failed: ' + describeFailures(verification),
      }
    }

    log.info('insumer', `Attestation verified (id=${attestationId}, met=${conditionMet})`)

    return {
      verified: true,
      attestationId,
      conditionMet,
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
