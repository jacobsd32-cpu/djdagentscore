import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createPublicClient, http } from 'viem'
import { buildDeploymentBundleUrl, fetchDeploymentBundle } from './deploy-evaluator-stack.mjs'
import {
  resolveEvaluatorStackDeploymentResult,
  validateDeploymentResultPayload,
} from './evaluator-stack-deployment-source.mjs'
import { buildRuntimeChain, resolveRpcUrl } from './evaluator-stack-runtime.mjs'

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

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`Missing ${label}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function validateBundle(bundle) {
  if (!bundle || bundle.standard !== 'djd-evaluator-deploy-bundle-v1') {
    throw new Error('Invalid deployment bundle payload')
  }
  return bundle
}

export async function verifyEvaluatorStackDeployment(options = {}) {
  const { deploymentResult, source: deploymentSource } = await resolveEvaluatorStackDeploymentResult(options)
  const result = validateDeploymentResultPayload(deploymentResult)
  const rpcResolution = resolveRpcUrl({
    rpcUrl: options.rpcUrl,
    network: result.network,
  })
  const explicitBundlePath = options.bundlePath ?? process.env.DJD_DEPLOY_BUNDLE_PATH
  const explicitBundleUrl = options.bundleUrl ?? process.env.DJD_DEPLOY_BUNDLE_URL
  const linkedBundleUrl = result?.links?.bundle ?? null
  const derivedBundleUrl =
    !options.bundle && !explicitBundlePath && !explicitBundleUrl && !linkedBundleUrl
      ? maybeBuildDeploymentBundleUrl({
          ...options,
          network: options.network ?? result.network?.key ?? null,
        })
      : null
  const bundle =
    options.bundle ??
    (explicitBundlePath
      ? readJsonFile(explicitBundlePath, 'DJD_DEPLOY_BUNDLE_PATH')
      : explicitBundleUrl || linkedBundleUrl || derivedBundleUrl
        ? await fetchDeploymentBundle(explicitBundleUrl ?? linkedBundleUrl ?? derivedBundleUrl)
        : null)

  if (!rpcResolution.ok) {
    throw new Error(`Missing rpcUrl. Set ${rpcResolution.expected_envs.join(' or ')}`)
  }

  const validatedBundle = bundle ? validateBundle(bundle) : null
  const chain = buildRuntimeChain(result.network, rpcResolution.rpcUrl)
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcResolution.rpcUrl),
  })

  const verifierAddress = result.contracts.verifier.address
  const escrowAddress = result.contracts.escrow.address

  const verifierAbi = validatedBundle?.artifacts?.verifier?.abi
  const escrowAbi = validatedBundle?.artifacts?.escrow?.abi
  if (!Array.isArray(verifierAbi) || !Array.isArray(escrowAbi)) {
    throw new Error('Verification requires verifier and escrow ABI artifacts')
  }

  const [oracleSigner, escrowVerifier, escrowProvider, escrowCounterparty, escrowIdHash, settled, releaseAuthorized] =
    await Promise.all([
      publicClient.readContract({
        address: verifierAddress,
        abi: verifierAbi,
        functionName: 'oracleSigner',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'verifier',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'provider',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'counterparty',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'escrowIdHash',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'settled',
      }),
      publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'releaseAuthorized',
      }),
    ])

  const checks = {
    oracle_signer_matches: oracleSigner === result.verification.oracle_signer,
    escrow_verifier_matches: escrowVerifier === result.verification.escrow_verifier,
    escrow_provider_matches: escrowProvider === result.verification.escrow_provider,
    escrow_counterparty_matches: escrowCounterparty === result.verification.escrow_counterparty,
    escrow_id_hash_matches: escrowIdHash === result.verification.escrow_id_hash,
  }

  const bundleChecks = validatedBundle
    ? {
        verifier_constructor_matches:
          validatedBundle.deployment.verifier.action === 'use_existing'
            ? verifierAddress === validatedBundle.deployment.verifier.current_address
            : oracleSigner === validatedBundle.deployment.verifier.constructor.initial_signer,
        escrow_constructor_matches:
          escrowProvider === validatedBundle.deployment.escrow.constructor.provider &&
          escrowCounterparty === validatedBundle.deployment.escrow.constructor.counterparty &&
          escrowIdHash === validatedBundle.deployment.escrow.constructor.escrow_id_hash,
      }
    : null

  const failedChecks = Object.entries({
    ...checks,
    ...(bundleChecks ?? {}),
  })
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  return {
    standard: 'djd-evaluator-deploy-verification-v1',
    ok: failedChecks.length === 0,
    verdict_id: result.verdict_id,
    network: result.network,
    contracts: result.contracts,
    onchain: {
      oracle_signer: oracleSigner,
      escrow_verifier: escrowVerifier,
      escrow_provider: escrowProvider,
      escrow_counterparty: escrowCounterparty,
      escrow_id_hash: escrowIdHash,
      settled,
      release_authorized: releaseAuthorized,
    },
    checks,
    bundle_checks: bundleChecks,
    failed_checks: failedChecks,
    deployment: deploymentSource,
    links: {
      bundle: explicitBundleUrl ?? linkedBundleUrl ?? derivedBundleUrl ?? null,
      deployment_registry: result.links?.deployment_registry ?? null,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyEvaluatorStackDeployment()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
