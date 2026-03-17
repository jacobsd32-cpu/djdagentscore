import { db } from './connection.js'

export interface EvaluatorVerdictRow {
  id: string
  wallet: string
  counterparty_wallet: string | null
  escrow_id: string | null
  baseline_profile: string
  certification_floor: string
  current_score: number
  current_tier: string
  score_confidence: number
  risk_score: number
  risk_level: string
  certification_active: number
  certification_tier: string | null
  decision: string
  recommendation: string
  approved: number
  confidence: number
  packet_hash: string
  forensic_trace_id: string
  attestation_scheme: string
  attestation_status: string
  attestation_digest: string
  attestation_signature: string | null
  attestation_signer: string | null
  attestation_reason: string | null
  attested_at: string | null
  payload_json: string
  created_at: string
}

const stmtInsertEvaluatorVerdict = db.prepare(`
  INSERT INTO evaluator_verdicts (
    id,
    wallet,
    counterparty_wallet,
    escrow_id,
    baseline_profile,
    certification_floor,
    current_score,
    current_tier,
    score_confidence,
    risk_score,
    risk_level,
    certification_active,
    certification_tier,
    decision,
    recommendation,
    approved,
    confidence,
    packet_hash,
    forensic_trace_id,
    attestation_scheme,
    attestation_status,
    attestation_digest,
    attestation_signature,
    attestation_signer,
    attestation_reason,
    attested_at,
    payload_json,
    created_at
  ) VALUES (
    @id,
    @wallet,
    @counterparty_wallet,
    @escrow_id,
    @baseline_profile,
    @certification_floor,
    @current_score,
    @current_tier,
    @score_confidence,
    @risk_score,
    @risk_level,
    @certification_active,
    @certification_tier,
    @decision,
    @recommendation,
    @approved,
    @confidence,
    @packet_hash,
    @forensic_trace_id,
    @attestation_scheme,
    @attestation_status,
    @attestation_digest,
    @attestation_signature,
    @attestation_signer,
    @attestation_reason,
    @attested_at,
    @payload_json,
    @created_at
  )
`)

const stmtGetEvaluatorVerdict = db.prepare<[string], EvaluatorVerdictRow>(`
  SELECT *
  FROM evaluator_verdicts
  WHERE id = ?
  LIMIT 1
`)

const stmtListEvaluatorVerdictsByWallet = db.prepare<[string, number], EvaluatorVerdictRow>(`
  SELECT *
  FROM evaluator_verdicts
  WHERE wallet = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`)

export function insertEvaluatorVerdict(verdict: Omit<EvaluatorVerdictRow, 'created_at'> & { created_at?: string }): void {
  stmtInsertEvaluatorVerdict.run({
    ...verdict,
    created_at: verdict.created_at ?? new Date().toISOString(),
  })
}

export function getEvaluatorVerdict(id: string): EvaluatorVerdictRow | undefined {
  return stmtGetEvaluatorVerdict.get(id)
}

export function listEvaluatorVerdictsByWallet(wallet: string, limit: number): EvaluatorVerdictRow[] {
  return stmtListEvaluatorVerdictsByWallet.all(wallet, limit)
}
