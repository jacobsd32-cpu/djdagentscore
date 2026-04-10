import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createPublicClient, http } from 'viem'
import { buildDeploymentBundleUrl, fetchDeploymentBundle } from './deploy-evaluator-stack.mjs'
import {
  resolveEvaluatorStackDeploymentResult,
  validateDeploymentResultPayload,
} from './evaluator-stack-deployment-source.mjs'
import { buildRuntimeChain, resolveRpcUrl, resolveRuntimeNetworkFromMetadata } from './evaluator-stack-runtime.mjs'
import { verifyEvaluatorStackDeployment } from './verify-evaluator-stack.mjs'

const OUTCOME_CODES = {
  release: 1,
  manual_review: 2,
  dispute: 3,
  reject: 4,
}

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`Missing ${label}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function maybeBuildDeploymentBundleUrl(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  const verdictId = options.verdictId ?? process.env.DJD_VERDICT_ID

  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    return null
  }
  if (typeof verdictId !== 'string' || verdictId.length === 0) {
    return null
  }

  return buildDeploymentBundleUrl(options)
}

async function fetchJson(url, requestInit, label) {
  const response = await fetch(url, requestInit)
  if (!response.ok) {
    throw new Error(`${label} request failed: ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

function buildRouteUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function validateBundle(bundle) {
  if (!bundle || bundle.standard !== 'djd-evaluator-deploy-bundle-v1') {
    throw new Error('Invalid deployment bundle payload')
  }
  if (!Array.isArray(bundle.artifacts?.verifier?.abi) || !Array.isArray(bundle.artifacts?.escrow?.abi)) {
    throw new Error('Deployment bundle must include verifier and escrow ABI artifacts')
  }
  return bundle
}

function validateProofPayload(payload, expectedChainId, expectedVerifierAddress) {
  if (!payload || payload.standard !== 'djd-evaluator-verifier-proof-v1') {
    throw new Error('Invalid evaluator proof payload')
  }
  if (payload.ready !== true) {
    throw new Error(`Evaluator proof is not ready: ${payload.reason ?? 'unknown'}`)
  }
  if (payload.verifier?.chain_id !== expectedChainId) {
    throw new Error(`Evaluator proof chain mismatch: expected ${expectedChainId}, got ${payload.verifier?.chain_id}`)
  }
  if (payload.attestation?.status !== 'signed' || typeof payload.attestation?.signature !== 'string') {
    throw new Error('Evaluator proof is missing a signed attestation')
  }
  if (payload.transaction?.to?.toLowerCase() !== expectedVerifierAddress.toLowerCase()) {
    throw new Error('Evaluator proof transaction target does not match deployed verifier')
  }
  if (payload.transaction?.data !== payload.call?.calldata) {
    throw new Error('Evaluator proof transaction data does not match call calldata')
  }
  return payload
}

function validateEscrowPayload(payload, expectedChainId, expectedEscrowAddress) {
  if (!payload || payload.standard !== 'djd-evaluator-escrow-settlement-v1') {
    throw new Error('Invalid evaluator escrow payload')
  }
  if (payload.ready !== true) {
    throw new Error(`Evaluator escrow payload is not ready: ${payload.reason ?? 'unknown'}`)
  }
  if (payload.escrow?.chain_id !== expectedChainId) {
    throw new Error(`Evaluator escrow chain mismatch: expected ${expectedChainId}, got ${payload.escrow?.chain_id}`)
  }
  if (payload.transaction?.to?.toLowerCase() !== expectedEscrowAddress.toLowerCase()) {
    throw new Error('Evaluator escrow transaction target does not match deployed escrow contract')
  }
  if (payload.transaction?.data !== payload.call?.calldata) {
    throw new Error('Evaluator escrow transaction data does not match call calldata')
  }
  return payload
}

async function resolveDeploymentBundle(options, deploymentResult) {
  const explicitBundle = options.bundle
  if (explicitBundle) {
    return validateBundle(explicitBundle)
  }

  const explicitBundlePath = options.bundlePath ?? process.env.DJD_DEPLOY_BUNDLE_PATH
  if (explicitBundlePath) {
    return validateBundle(readJsonFile(explicitBundlePath, 'DJD_DEPLOY_BUNDLE_PATH'))
  }

  const explicitBundleUrl = options.bundleUrl ?? process.env.DJD_DEPLOY_BUNDLE_URL
  const linkedBundleUrl = deploymentResult?.links?.bundle ?? null
  const derivedBundleUrl =
    !explicitBundleUrl && !linkedBundleUrl
      ? maybeBuildDeploymentBundleUrl({
          ...options,
          network: options.network ?? deploymentResult?.network?.key ?? null,
        })
      : null
  const bundleUrl = explicitBundleUrl ?? linkedBundleUrl ?? derivedBundleUrl

  if (!bundleUrl) {
    throw new Error('Provide bundle, bundlePath, bundleUrl, or DJD_API_BASE_URL + DJD_VERDICT_ID')
  }

  return validateBundle(await fetchDeploymentBundle(bundleUrl, { headers: options.requestHeaders ?? {} }))
}

export async function runEvaluatorStackSmoke(options = {}) {
  const { deploymentResult, source: deploymentSource } = await resolveEvaluatorStackDeploymentResult(options)
  const validatedDeploymentResult = validateDeploymentResultPayload(deploymentResult)
  const rpcResolution = resolveRpcUrl({
    rpcUrl: options.rpcUrl,
    network: validatedDeploymentResult.network,
  })
  if (!rpcResolution.ok) {
    throw new Error(`Missing rpcUrl. Set ${rpcResolution.expected_envs.join(' or ')}`)
  }
  const rpcUrl = rpcResolution.rpcUrl
  const bundle = await resolveDeploymentBundle(options, validatedDeploymentResult)
  const requestHeaders = options.requestHeaders ?? {}
  const verification = await verifyEvaluatorStackDeployment({
    ...options,
    rpcUrl,
    deploymentResult: validatedDeploymentResult,
    bundle,
  })

  if (!verification.ok) {
    throw new Error(`Deployment verification failed: ${verification.failed_checks.join(', ')}`)
  }

  const networkKey = resolveRuntimeNetworkFromMetadata(validatedDeploymentResult.network).key
  const verdictId = options.verdictId ?? process.env.DJD_VERDICT_ID ?? validatedDeploymentResult.verdict_id
  if (typeof verdictId !== 'string' || verdictId.length === 0) {
    throw new Error('Missing evaluator verdict id for smoke check')
  }

  const proofBaseUrl =
    options.proofUrl ??
    validatedDeploymentResult.links?.verifier_proof ??
    (options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
      ? `${options.apiBaseUrl ?? process.env.DJD_API_BASE_URL}/v1/score/evaluator/proof`
      : null)
  const escrowBaseUrl =
    options.escrowUrl ??
    validatedDeploymentResult.links?.escrow_settlement ??
    (options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
      ? `${options.apiBaseUrl ?? process.env.DJD_API_BASE_URL}/v1/score/evaluator/escrow`
      : null)

  if (!proofBaseUrl || !escrowBaseUrl) {
    throw new Error('Missing proof or escrow smoke endpoint URL')
  }

  const useRegistryAddressResolution =
    !options.proofUrl &&
    !options.escrowUrl &&
    (deploymentSource.kind === 'registry_file' || deploymentSource.kind === 'api_registry')

  const proofUrl = buildRouteUrl(proofBaseUrl, {
    id: verdictId,
    network: networkKey,
    target_contract: useRegistryAddressResolution ? null : validatedDeploymentResult.contracts.verifier.address,
  })
  const escrowUrl = buildRouteUrl(escrowBaseUrl, {
    id: verdictId,
    network: networkKey,
    escrow_contract: useRegistryAddressResolution ? null : validatedDeploymentResult.contracts.escrow.address,
  })

  const [proofPayload, escrowPayload] = await Promise.all([
    fetchJson(proofUrl, { headers: requestHeaders }, 'Evaluator proof'),
    fetchJson(escrowUrl, { headers: requestHeaders }, 'Evaluator escrow'),
  ])

  const validatedProof = validateProofPayload(
    proofPayload,
    validatedDeploymentResult.network.chain_id,
    validatedDeploymentResult.contracts.verifier.address,
  )
  const validatedEscrow = validateEscrowPayload(
    escrowPayload,
    validatedDeploymentResult.network.chain_id,
    validatedDeploymentResult.contracts.escrow.address,
  )

  const publicClient = createPublicClient({
    chain: buildRuntimeChain(validatedDeploymentResult.network, rpcUrl),
    transport: http(rpcUrl),
  })
  const verifierAbi = bundle.artifacts.verifier.abi
  const escrowAbi = bundle.artifacts.escrow.abi
  const signature = validatedProof.attestation.signature

  const [onchainDigest, verifierAccepted] = await Promise.all([
    publicClient.readContract({
      address: validatedDeploymentResult.contracts.verifier.address,
      abi: verifierAbi,
      functionName: 'hashVerdict',
      args: [validatedProof.verdict],
    }),
    publicClient.readContract({
      address: validatedDeploymentResult.contracts.verifier.address,
      abi: verifierAbi,
      functionName: 'verifyVerdict',
      args: [validatedProof.verdict, signature],
    }),
  ])

  if (verifierAccepted !== true) {
    throw new Error('Onchain verifier rejected the evaluator proof attestation')
  }

  const simulation = await publicClient.simulateContract({
    address: validatedDeploymentResult.contracts.escrow.address,
    abi: escrowAbi,
    functionName: 'settleWithDJDVerdict',
    args: [validatedEscrow.verdict, validatedEscrow.attestation.signature],
    account: validatedEscrow.verdict.wallet,
  })

  const expectedOutcomeCode = OUTCOME_CODES[validatedEscrow.settlement.outcome]
  const simulatedOutcomeCode = Number(simulation.result)
  if (simulatedOutcomeCode !== expectedOutcomeCode) {
    throw new Error(
      `Escrow simulation outcome mismatch: expected ${expectedOutcomeCode}, got ${simulatedOutcomeCode}`,
    )
  }

  return {
    standard: 'djd-evaluator-live-smoke-v1',
    ok: true,
    verdict_id: verdictId,
    network: validatedDeploymentResult.network,
    deployment: {
      source: deploymentSource,
      used_registry_address_resolution: useRegistryAddressResolution,
    },
    deployment_verification: verification,
    api: {
      proof_url: proofUrl,
      escrow_url: escrowUrl,
      proof_ready: validatedProof.ready,
      escrow_ready: validatedEscrow.ready,
    },
    verifier: {
      address: validatedDeploymentResult.contracts.verifier.address,
      digest: onchainDigest,
      digest_matches_attestation: onchainDigest === validatedProof.attestation.digest,
      accepted: verifierAccepted,
    },
    escrow: {
      address: validatedDeploymentResult.contracts.escrow.address,
      expected_outcome: validatedEscrow.settlement.outcome,
      expected_outcome_code: expectedOutcomeCode,
      simulated_outcome_code: simulatedOutcomeCode,
      simulation_ok: simulatedOutcomeCode === expectedOutcomeCode,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvaluatorStackSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[contracts:smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
