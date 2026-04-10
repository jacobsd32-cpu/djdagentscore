import { Hono, type Context } from 'hono'
import { errorResponse, ErrorCodes } from '../errors.js'
import { getEvaluatorArtifactPackageView } from '../services/contractArtifactService.js'
import {
  getEvaluatorDeploymentPromotionBundleView,
  getEvaluatorDeploymentRegistryView,
} from '../services/evaluatorDeploymentRegistryService.js'
import {
  getEvaluatorNetworkCatalogView,
  getEvaluatorDeploymentBundleView,
  getEvaluatorDeploymentPlanView,
  getEvaluatorEscrowSettlementView,
  getEvaluatorVerifierPackageView,
  getEvaluatorVerifierProofView,
} from '../services/evaluatorContractService.js'
import { resolveEvaluatorNetwork } from '../services/evaluatorNetworkService.js'
import {
  getEvaluatorContractCallbackView,
  getEvaluatorEvidencePacket,
  getEvaluatorOracleVerdict,
  getEvaluatorPreview,
  getEvaluatorVerdictRecord,
  listEvaluatorVerdictHistory,
} from '../services/evaluatorService.js'
import { getRiskScore } from '../services/riskService.js'
import {
  getBasicScore,
  getBatchScores,
  getFullScore,
  getScoreJobStatus,
  queueScoreComputation,
  refreshScore,
} from '../services/scoreService.js'
import { getErc8004CompatibleScoreView } from '../services/standardsService.js'

const score = new Hono()

// GET /v1/score/basic?wallet=0x...
score.get('/basic', async (c) => {
  const outcome = await getBasicScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/erc8004?wallet=0x...
score.get('/erc8004', async (c) => {
  const outcome = await getErc8004CompatibleScoreView(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/verifier
score.get('/evaluator/verifier', (c) => {
  const network = resolveEvaluatorNetwork(c.req.query('network'))
  if (!network) {
    return c.json(errorResponse(ErrorCodes.INVALID_NETWORK, 'Invalid or unsupported network'), 400)
  }

  return c.json(getEvaluatorVerifierPackageView(network))
})

// GET /v1/score/evaluator/networks
score.get('/evaluator/networks', (c) => c.json(getEvaluatorNetworkCatalogView()))

// GET /v1/score/evaluator/deployments
score.get('/evaluator/deployments', (c) => {
  const outcome = getEvaluatorDeploymentRegistryView(c.req.query('network'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/promotion
score.get('/evaluator/promotion', (c) => {
  const outcome = getEvaluatorDeploymentPromotionBundleView(c.req.query('network'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/artifacts
score.get('/evaluator/artifacts', (c) => c.json(getEvaluatorArtifactPackageView()))

// GET /v1/score/evaluator/proof?id=verdict_...&target_contract=0x...
score.get('/evaluator/proof', (c) => {
  const outcome = getEvaluatorVerifierProofView({
    rawVerdictId: c.req.query('id'),
    rawTargetContract: c.req.query('target_contract'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/escrow?id=verdict_...&escrow_contract=0x...
score.get('/evaluator/escrow', (c) => {
  const outcome = getEvaluatorEscrowSettlementView({
    rawVerdictId: c.req.query('id'),
    rawEscrowContract: c.req.query('escrow_contract'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/deploy?id=verdict_...&verifier_contract=0x...
score.get('/evaluator/deploy', (c) => {
  const outcome = getEvaluatorDeploymentPlanView({
    rawVerdictId: c.req.query('id'),
    rawVerifierContract: c.req.query('verifier_contract'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/deploy/bundle?id=verdict_...&verifier_contract=0x...
score.get('/evaluator/deploy/bundle', (c) => {
  const outcome = getEvaluatorDeploymentBundleView({
    rawVerdictId: c.req.query('id'),
    rawVerifierContract: c.req.query('verifier_contract'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/evidence?wallet=0x...
score.get('/evaluator/evidence', async (c) => {
  const outcome = await getEvaluatorEvidencePacket(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/oracle?wallet=0x...&counterparty_wallet=0x...&escrow_id=abc
score.get('/evaluator/oracle', async (c) => {
  const outcome = await getEvaluatorOracleVerdict({
    rawWallet: c.req.query('wallet'),
    rawCounterpartyWallet: c.req.query('counterparty_wallet'),
    rawEscrowId: c.req.query('escrow_id'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/verdict?id=verdict_...
score.get('/evaluator/verdict', (c) => {
  const outcome = getEvaluatorVerdictRecord(c.req.query('id'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/callback?id=verdict_...&target_contract=0x...
score.get('/evaluator/callback', (c) => {
  const outcome = getEvaluatorContractCallbackView({
    rawVerdictId: c.req.query('id'),
    rawTargetContract: c.req.query('target_contract'),
    rawNetwork: c.req.query('network'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator/verdicts?wallet=0x...&limit=20
score.get('/evaluator/verdicts', (c) => {
  const outcome = listEvaluatorVerdictHistory({
    rawWallet: c.req.query('wallet'),
    rawLimit: c.req.query('limit'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/full?wallet=0x...
score.get('/full', async (c) => {
  const outcome = await getFullScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/evaluator?wallet=0x...
score.get('/evaluator', async (c) => {
  const outcome = await getEvaluatorPreview(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// GET /v1/score/risk?wallet=0x...
score.get('/risk', async (c) => {
  const outcome = await getRiskScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// POST /v1/score/refresh — forces a live recalculation (mutation → POST is correct)
// Also accepts GET for backward compatibility (deprecated).
async function handleRefresh(c: Context) {
  const outcome = await refreshScore(c.req.query('wallet'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
}
score.post('/refresh', handleRefresh)
score.get('/refresh', handleRefresh) // deprecated — prefer POST

// POST /v1/score/compute
// Queues a background full-scan score computation and returns a jobId immediately.
// Free — useful when the caller can't wait 20-150s for the synchronous endpoints.
// Accepts wallet from JSON body { wallet: "0x..." } or query param ?wallet=0x... (deprecated).
score.post('/compute', async (c) => {
  const outcome = await queueScoreComputation(
    c.req.query('wallet'),
    async () => await c.req.json<{ wallet?: string }>(),
  )
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 202)
})

// GET /v1/score/job/:jobId
// Poll the status of an async scoring job.
score.get('/job/:jobId', (c) => {
  const outcome = getScoreJobStatus(c.req.param('jobId'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

// POST /v1/score/batch
// Score up to 20 wallets in one request ($0.50 flat fee via x402).
score.post('/batch', async (c) => {
  let body: { wallets?: unknown }
  try {
    body = await c.req.json<{ wallets?: unknown }>()
  } catch {
    return c.json(errorResponse(ErrorCodes.INVALID_JSON, 'Invalid JSON body'), 400)
  }

  const outcome = await getBatchScores(body.wallets)
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default score
