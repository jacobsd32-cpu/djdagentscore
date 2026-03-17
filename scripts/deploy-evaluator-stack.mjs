import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildRuntimeChain, resolveRpcUrl } from './evaluator-stack-runtime.mjs'

function requirePrivateKey(value, fieldName) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value ?? '')) {
    throw new Error(`Missing or invalid ${fieldName}`)
  }
  return value.toLowerCase()
}

function requireArtifact(entry, contractName) {
  if (!entry) {
    throw new Error(`Missing artifact entry for ${contractName}`)
  }
  if (!entry.deployable) {
    throw new Error(`Artifact ${contractName} is not deployable`)
  }
  if (!Array.isArray(entry.abi)) {
    throw new Error(`Artifact ${contractName} is missing ABI`)
  }
  if (typeof entry.bytecode !== 'string' || !entry.bytecode.startsWith('0x')) {
    throw new Error(`Artifact ${contractName} is missing bytecode`)
  }
  return entry
}

export function validateDeploymentBundle(bundle) {
  if (!bundle || bundle.standard !== 'djd-evaluator-deploy-bundle-v1') {
    throw new Error('Invalid deployment bundle payload')
  }
  if (!bundle.artifacts?.available) {
    throw new Error('Deployment bundle does not include compiled artifacts')
  }
  if (!bundle.network?.chain_id || !bundle.network?.chain_name) {
    throw new Error('Deployment bundle is missing network metadata')
  }
  return bundle
}

function resolveExplorerBaseUrl(chainId) {
  if (chainId === 8453) return 'https://basescan.org'
  if (chainId === 84532) return 'https://sepolia.basescan.org'
  return null
}

function buildExplorerLinks(chainId, deployment) {
  const baseUrl = resolveExplorerBaseUrl(chainId)
  if (!baseUrl) {
    return null
  }

  return {
    verifier_address: `${baseUrl}/address/${deployment.contracts.verifier.address}`,
    verifier_transaction: deployment.contracts.verifier.tx_hash
      ? `${baseUrl}/tx/${deployment.contracts.verifier.tx_hash}`
      : null,
    escrow_address: `${baseUrl}/address/${deployment.contracts.escrow.address}`,
    escrow_transaction: deployment.contracts.escrow.tx_hash
      ? `${baseUrl}/tx/${deployment.contracts.escrow.tx_hash}`
      : null,
  }
}

export function buildDeploymentBundleUrl(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  const verdictId = options.verdictId ?? process.env.DJD_VERDICT_ID
  const network = options.network ?? process.env.DJD_NETWORK
  const verifierContract = options.verifierContract ?? process.env.DJD_VERIFIER_CONTRACT

  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    throw new Error('Missing DJD_API_BASE_URL')
  }
  if (typeof verdictId !== 'string' || verdictId.length === 0) {
    throw new Error('Missing DJD_VERDICT_ID')
  }

  const url = new URL('/v1/score/evaluator/deploy/bundle', apiBaseUrl)
  url.searchParams.set('id', verdictId)
  if (typeof network === 'string' && network.length > 0) {
    url.searchParams.set('network', network)
  }
  if (typeof verifierContract === 'string' && verifierContract.length > 0) {
    url.searchParams.set('verifier_contract', verifierContract)
  }
  return url.toString()
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

export async function fetchDeploymentBundle(bundleUrl, requestInit = {}) {
  const response = await fetch(bundleUrl, requestInit)
  if (!response.ok) {
    throw new Error(`Bundle request failed: ${response.status} ${response.statusText}`)
  }
  return validateDeploymentBundle(await response.json())
}

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`Missing ${label}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export async function resolveDeploymentBundle(options = {}) {
  if (options.bundle) {
    return validateDeploymentBundle(options.bundle)
  }

  const bundlePath = options.bundlePath ?? process.env.DJD_DEPLOY_BUNDLE_PATH
  if (typeof bundlePath === 'string' && bundlePath.trim().length > 0) {
    return validateDeploymentBundle(readJsonFile(bundlePath, 'DJD_DEPLOY_BUNDLE_PATH'))
  }

  const bundleUrl = options.bundleUrl ?? process.env.DJD_DEPLOY_BUNDLE_URL
  const derivedBundleUrl = !bundleUrl ? maybeBuildDeploymentBundleUrl(options) : null
  const requestHeaders = options.requestHeaders ?? {}

  if (!bundleUrl && !derivedBundleUrl) {
    throw new Error('Provide bundle, DJD_DEPLOY_BUNDLE_PATH, DJD_DEPLOY_BUNDLE_URL, or DJD_API_BASE_URL + DJD_VERDICT_ID')
  }

  return await fetchDeploymentBundle(bundleUrl ?? derivedBundleUrl, { headers: requestHeaders })
}

export function writeDeploymentResult(outputPath, result) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return
  }

  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
}

export async function deployEvaluatorStackFromBundle(options) {
  const bundle = validateDeploymentBundle(options.bundle)
  const rpcResolution = resolveRpcUrl({
    rpcUrl: options.rpcUrl,
    network: bundle.network,
  })
  const deployerPrivateKey = requirePrivateKey(options.deployerPrivateKey, 'deployerPrivateKey')

  if (!rpcResolution.ok) {
    throw new Error(`Missing rpcUrl. Set ${rpcResolution.expected_envs.join(' or ')}`)
  }
  const rpcUrl = rpcResolution.rpcUrl

  const deployerAccount = privateKeyToAccount(deployerPrivateKey)
  const chain = buildRuntimeChain(bundle.network, rpcUrl)
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  })
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain,
    transport: http(rpcUrl),
  })

  const verifierArtifact = requireArtifact(bundle.artifacts.verifier, 'DJDEvaluatorVerdictVerifier')
  const escrowArtifact = requireArtifact(bundle.artifacts.escrow, 'DJDEvaluatorEscrowSettlementExample')

  let verifierAddress = bundle.deployment.verifier.current_address
  let verifierTxHash = null

  if (bundle.deployment.verifier.action === 'deploy') {
    const initialSigner = bundle.deployment.verifier.constructor?.initial_signer
    if (!isAddress(initialSigner ?? '')) {
      throw new Error('Deployment bundle is missing a valid verifier initial_signer')
    }

    verifierTxHash = await walletClient.deployContract({
      abi: verifierArtifact.abi,
      bytecode: verifierArtifact.bytecode,
      args: [initialSigner],
      account: deployerAccount,
      chain,
    })
    const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierTxHash })
    verifierAddress = verifierReceipt.contractAddress
  }

  if (!isAddress(verifierAddress ?? '')) {
    throw new Error('Deployment bundle did not resolve a usable verifier address')
  }

  const escrowConstructor = bundle.deployment.escrow.constructor
  if (!isAddress(escrowConstructor.provider ?? '')) {
    throw new Error('Deployment bundle escrow constructor is missing a valid provider address')
  }
  if (!isAddress(escrowConstructor.counterparty ?? '')) {
    throw new Error('Deployment bundle escrow constructor is missing a valid counterparty address')
  }
  if (typeof escrowConstructor.escrow_id_hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(escrowConstructor.escrow_id_hash)) {
    throw new Error('Deployment bundle escrow constructor is missing a valid escrow_id_hash')
  }
  if (escrowConstructor.escrow_id !== null && typeof escrowConstructor.escrow_id !== 'string') {
    throw new Error('Deployment bundle escrow constructor is missing a valid escrow_id')
  }

  const escrowTxHash = await walletClient.deployContract({
    abi: escrowArtifact.abi,
    bytecode: escrowArtifact.bytecode,
    args: [
      verifierAddress,
      escrowConstructor.provider,
      escrowConstructor.counterparty,
      escrowConstructor.escrow_id_hash,
    ],
    account: deployerAccount,
    chain,
  })
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowTxHash })
  const escrowAddress = escrowReceipt.contractAddress
  if (!isAddress(escrowAddress ?? '')) {
    throw new Error('Escrow deployment did not return a usable address')
  }

  const [oracleSigner, escrowVerifier, escrowProvider, escrowCounterparty, escrowIdHash] = await Promise.all([
    publicClient.readContract({
      address: verifierAddress,
      abi: verifierArtifact.abi,
      functionName: 'oracleSigner',
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: 'verifier',
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: 'provider',
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: 'counterparty',
    }),
    publicClient.readContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: 'escrowIdHash',
    }),
  ])

  const result = {
    standard: 'djd-evaluator-deploy-result-v1',
    network: bundle.network,
    verdict_id: bundle.verdict_id,
    deployer: deployerAccount.address,
    contracts: {
      verifier: {
        contract: bundle.deployment.verifier.contract,
        address: verifierAddress,
        tx_hash: verifierTxHash,
        action: bundle.deployment.verifier.action,
      },
      escrow: {
        contract: bundle.deployment.escrow.contract,
        address: escrowAddress,
        tx_hash: escrowTxHash,
        action: bundle.deployment.escrow.action,
      },
    },
    verification: {
      oracle_signer: oracleSigner,
      escrow_verifier: escrowVerifier,
      escrow_provider: escrowProvider,
      escrow_counterparty: escrowCounterparty,
      escrow_id_hash: escrowIdHash,
    },
    inputs: {
      network_key: bundle.network.key ?? null,
      provider: escrowConstructor.provider,
      counterparty: escrowConstructor.counterparty,
      escrow_id: escrowConstructor.escrow_id ?? null,
    },
    links: bundle.links,
  }

  return {
    ...result,
    explorer: buildExplorerLinks(bundle.network.chain_id, result),
  }
}

export async function runEvaluatorStackDeployment(options = {}) {
  const rpcUrl = options.rpcUrl
  const deployerPrivateKey = options.deployerPrivateKey ?? process.env.DJD_DEPLOYER_PRIVATE_KEY
  const outputPath = options.outputPath ?? process.env.DJD_DEPLOY_RESULT_PATH
  const resolvedBundle = await resolveDeploymentBundle(options)
  const result = await deployEvaluatorStackFromBundle({
    bundle: resolvedBundle,
    rpcUrl,
    deployerPrivateKey,
  })
  writeDeploymentResult(outputPath, result)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvaluatorStackDeployment()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(`[deploy] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
