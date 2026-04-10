import { appendFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolveEvaluatorStackDeploymentResult } from './evaluator-stack-deployment-source.mjs'

const PROMOTION_STANDARD = 'djd-evaluator-promotion-env-v1'
const PROMOTION_BUNDLE_STANDARD = 'djd-evaluator-promotion-bundle-v1'
const GITHUB_OUTPUT_ENV = 'GITHUB_OUTPUT'

function writeJsonFile(outputPath, payload) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return null
  }

  writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n')
  return outputPath
}

function writeTextFile(outputPath, contents) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return null
  }

  writeFileSync(outputPath, contents)
  return outputPath
}

function appendTextFile(outputPath, contents) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return null
  }

  appendFileSync(outputPath, contents)
  return outputPath
}

function sanitizeNetworkEnvSegment(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function inferApiBaseUrlFromLinks(links = {}) {
  const candidates = [
    links.verifier_package,
    links.artifact_package,
    links.verifier_proof,
    links.escrow_settlement,
    links.bundle,
    links.deployment_registry,
    links.promotion_bundle,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0)

  const suffixes = [
    '/v1/score/evaluator/verifier',
    '/v1/score/evaluator/artifacts',
    '/v1/score/evaluator/proof',
    '/v1/score/evaluator/escrow',
    '/v1/score/evaluator/deploy/bundle',
    '/v1/score/evaluator/deployments',
    '/v1/score/evaluator/promotion',
  ]

  for (const candidate of candidates) {
    for (const suffix of suffixes) {
      const index = candidate.indexOf(suffix)
      if (index > 0) {
        return candidate.slice(0, index)
      }
    }
  }

  return null
}

function buildRouteUrl(apiBaseUrl, pathname, params = {}) {
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.trim().length === 0) {
    return null
  }

  const url = new URL(pathname, apiBaseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function fetchJson(url, requestInit, label) {
  const response = await fetch(url, requestInit)
  if (!response.ok) {
    throw new Error(`${label} request failed: ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

function ensureTrailingNewline(value) {
  const normalized = String(value ?? '')
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function normalizeRenderedOutputs(outputs = {}) {
  return {
    ...outputs,
    dotenv: ensureTrailingNewline(outputs.dotenv ?? ''),
    shell: ensureTrailingNewline(outputs.shell ?? ''),
    github_output: ensureTrailingNewline(outputs.github_output ?? ''),
  }
}

function validatePromotionBundlePayload(payload, options = {}) {
  if (!payload || payload.standard !== PROMOTION_BUNDLE_STANDARD) {
    throw new Error('Invalid promotion bundle payload')
  }

  if (!payload.ready || !payload.outputs || !payload.deployment || !payload.network) {
    throw new Error(`Promotion bundle is not ready${payload?.reason ? `: ${payload.reason}` : ''}`)
  }

  const expectedNetwork = options.network ?? process.env.DJD_NETWORK ?? null
  if (
    typeof expectedNetwork === 'string' &&
    expectedNetwork.trim().length > 0 &&
    payload.network?.key &&
    payload.network.key !== expectedNetwork.trim()
  ) {
    throw new Error(
      `Promotion bundle network mismatch: expected=${expectedNetwork.trim()} actual=${payload.network.key}`,
    )
  }

  return payload
}

function maybeBuildPromotionBundleUrl(options = {}) {
  const configuredUrl = options.promotionUrl ?? process.env.DJD_PROMOTION_URL
  if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
    return configuredUrl.trim()
  }

  const apiBaseUrl = options.apiBaseUrl ?? process.env.DJD_API_BASE_URL
  return buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/promotion', {
    network: options.network ?? process.env.DJD_NETWORK,
  })
}

async function resolvePromotionBundle(options = {}) {
  if (options.promotionBundle) {
    return {
      bundle: validatePromotionBundlePayload(options.promotionBundle, options),
      source: {
        kind: 'inline_promotion_bundle',
        location: 'inline',
        network: options.promotionBundle?.network?.key ?? null,
      },
    }
  }

  const promotionUrl = maybeBuildPromotionBundleUrl(options)
  if (typeof promotionUrl !== 'string' || promotionUrl.length === 0) {
    return null
  }

  try {
    const bundle = validatePromotionBundlePayload(
      await fetchJson(promotionUrl, { headers: options.requestHeaders ?? {} }, 'Promotion bundle'),
      options,
    )

    return {
      bundle,
      source: {
        kind: 'api_promotion_bundle',
        location: promotionUrl,
        network: bundle.network?.key ?? options.network ?? null,
      },
    }
  } catch {
    return null
  }
}

function normalizePromotionLinks(deploymentResult, deploymentSource, options = {}) {
  const networkKey = deploymentResult.network?.key ?? null
  const verdictId = deploymentResult.verdict_id ?? null
  const apiBaseUrl =
    options.apiBaseUrl ?? process.env.DJD_API_BASE_URL ?? inferApiBaseUrlFromLinks(deploymentResult.links)

  return {
    api_base_url: typeof apiBaseUrl === 'string' && apiBaseUrl.trim().length > 0 ? apiBaseUrl.trim() : null,
    verifier_package:
      deploymentResult.links?.verifier_package ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/verifier', {
        network: networkKey,
      }),
    artifact_package:
      deploymentResult.links?.artifact_package ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/artifacts'),
    verifier_proof:
      deploymentResult.links?.verifier_proof ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/proof', {
        id: verdictId,
        network: networkKey,
      }),
    escrow_settlement:
      deploymentResult.links?.escrow_settlement ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/escrow', {
        id: verdictId,
        network: networkKey,
      }),
    deploy_bundle:
      deploymentResult.links?.bundle ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/deploy/bundle', {
        id: verdictId,
        network: networkKey,
      }),
    deployment_registry:
      deploymentResult.links?.deployment_registry ??
      (deploymentSource.kind === 'api_registry' ? deploymentSource.location : null) ??
      buildRouteUrl(apiBaseUrl, '/v1/score/evaluator/deployments', {
        network: networkKey,
      }),
  }
}

function setVariable(target, key, value) {
  if (value === undefined || value === null || value === '') {
    return
  }
  target[key] = String(value)
}

function buildGenericVariables(deploymentResult, deploymentSource, promotionLinks) {
  const variables = {}
  setVariable(variables, 'DJD_NETWORK', deploymentResult.network?.key)
  setVariable(variables, 'DJD_CHAIN_ID', deploymentResult.network?.chain_id)
  setVariable(variables, 'DJD_CHAIN_NAME', deploymentResult.network?.chain_name)
  setVariable(variables, 'DJD_CAIP2', deploymentResult.network?.caip2)
  setVariable(variables, 'DJD_ENVIRONMENT', deploymentResult.network?.environment)
  setVariable(variables, 'DJD_VERDICT_ID', deploymentResult.verdict_id)
  setVariable(variables, 'DJD_DEPLOYMENT_SOURCE', deploymentSource.kind)
  setVariable(variables, 'DJD_DEPLOYMENT_SOURCE_LOCATION', deploymentSource.location)
  setVariable(variables, 'DJD_DEPLOYER_ADDRESS', deploymentResult.deployer)
  setVariable(variables, 'DJD_VERIFIER_CONTRACT', deploymentResult.contracts?.verifier?.address)
  setVariable(variables, 'DJD_ESCROW_CONTRACT', deploymentResult.contracts?.escrow?.address)
  setVariable(variables, 'DJD_ORACLE_SIGNER', deploymentResult.verification?.oracle_signer)
  setVariable(
    variables,
    'DJD_ESCROW_PROVIDER',
    deploymentResult.verification?.escrow_provider ?? deploymentResult.inputs?.provider,
  )
  setVariable(
    variables,
    'DJD_ESCROW_COUNTERPARTY',
    deploymentResult.verification?.escrow_counterparty ?? deploymentResult.inputs?.counterparty,
  )
  setVariable(variables, 'DJD_ESCROW_ID', deploymentResult.inputs?.escrow_id)
  setVariable(variables, 'DJD_ESCROW_ID_HASH', deploymentResult.verification?.escrow_id_hash)
  setVariable(variables, 'DJD_API_BASE_URL', promotionLinks.api_base_url)
  setVariable(variables, 'DJD_VERIFIER_PACKAGE_URL', promotionLinks.verifier_package)
  setVariable(variables, 'DJD_ARTIFACT_PACKAGE_URL', promotionLinks.artifact_package)
  setVariable(variables, 'DJD_VERIFIER_PROOF_URL', promotionLinks.verifier_proof)
  setVariable(variables, 'DJD_ESCROW_SETTLEMENT_URL', promotionLinks.escrow_settlement)
  setVariable(variables, 'DJD_DEPLOY_BUNDLE_URL', promotionLinks.deploy_bundle)
  setVariable(variables, 'DJD_DEPLOYMENTS_URL', promotionLinks.deployment_registry)
  setVariable(variables, 'DJD_VERIFIER_EXPLORER_URL', deploymentResult.explorer?.verifier_address)
  setVariable(variables, 'DJD_VERIFIER_TX_URL', deploymentResult.explorer?.verifier_transaction)
  setVariable(variables, 'DJD_ESCROW_EXPLORER_URL', deploymentResult.explorer?.escrow_address)
  setVariable(variables, 'DJD_ESCROW_TX_URL', deploymentResult.explorer?.escrow_transaction)
  return variables
}

function buildNetworkScopedVariables(deploymentResult, promotionLinks) {
  const networkSegment = sanitizeNetworkEnvSegment(deploymentResult.network?.key ?? deploymentResult.network?.chain_id)
  const variables = {}
  if (!networkSegment) {
    return variables
  }

  setVariable(variables, `DJD_${networkSegment}_NETWORK`, deploymentResult.network?.key)
  setVariable(variables, `DJD_${networkSegment}_CHAIN_ID`, deploymentResult.network?.chain_id)
  setVariable(variables, `DJD_${networkSegment}_VERDICT_ID`, deploymentResult.verdict_id)
  setVariable(variables, `DJD_${networkSegment}_VERIFIER_CONTRACT`, deploymentResult.contracts?.verifier?.address)
  setVariable(variables, `DJD_${networkSegment}_ESCROW_CONTRACT`, deploymentResult.contracts?.escrow?.address)
  setVariable(variables, `DJD_${networkSegment}_ORACLE_SIGNER`, deploymentResult.verification?.oracle_signer)
  setVariable(variables, `DJD_${networkSegment}_VERIFIER_PACKAGE_URL`, promotionLinks.verifier_package)
  setVariable(variables, `DJD_${networkSegment}_ARTIFACT_PACKAGE_URL`, promotionLinks.artifact_package)
  setVariable(variables, `DJD_${networkSegment}_VERIFIER_PROOF_URL`, promotionLinks.verifier_proof)
  setVariable(variables, `DJD_${networkSegment}_ESCROW_SETTLEMENT_URL`, promotionLinks.escrow_settlement)
  setVariable(variables, `DJD_${networkSegment}_DEPLOY_BUNDLE_URL`, promotionLinks.deploy_bundle)
  setVariable(variables, `DJD_${networkSegment}_DEPLOYMENTS_URL`, promotionLinks.deployment_registry)
  return variables
}

function escapeDotenvValue(value) {
  const normalized = String(value)
  if (/^[A-Za-z0-9_./:-]+$/.test(normalized)) {
    return normalized
  }
  return `"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

function escapeShellValue(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`
}

function formatKeyValueLines(variables, formatter) {
  return Object.entries(variables)
    .map(([key, value]) => formatter(key, value))
    .join('\n')
}

export async function promoteEvaluatorStackDeployment(options = {}) {
  const promotionBundle = await resolvePromotionBundle(options)
  const result = promotionBundle
    ? {
        standard: PROMOTION_STANDARD,
        ok: true,
        network: promotionBundle.bundle.network,
        deployment: {
          verdict_id: promotionBundle.bundle.deployment?.verdict_id ?? null,
          source: promotionBundle.source,
          deployer: promotionBundle.bundle.deployment?.deployer ?? null,
          contracts: promotionBundle.bundle.deployment?.contracts ?? null,
          verification: promotionBundle.bundle.deployment?.verification ?? null,
          inputs: promotionBundle.bundle.deployment?.inputs ?? null,
        },
        outputs: normalizeRenderedOutputs(promotionBundle.bundle.outputs),
        files: {
          json: null,
          dotenv: null,
          shell: null,
          github_output: null,
        },
      }
    : await (async () => {
        const { deploymentResult, source: deploymentSource } = await resolveEvaluatorStackDeploymentResult(options)
        const promotionLinks = normalizePromotionLinks(deploymentResult, deploymentSource, options)
        const genericVariables = buildGenericVariables(deploymentResult, deploymentSource, promotionLinks)
        const networkScopedVariables = buildNetworkScopedVariables(deploymentResult, promotionLinks)
        const allVariables = {
          ...genericVariables,
          ...networkScopedVariables,
        }

        const dotenv = `${formatKeyValueLines(allVariables, (key, value) => `${key}=${escapeDotenvValue(value)}`)}\n`
        const shell = `${formatKeyValueLines(allVariables, (key, value) => `export ${key}=${escapeShellValue(value)}`)}\n`
        const githubOutput = `${formatKeyValueLines(allVariables, (key, value) => `${key}=${value}`)}\n`

        return {
          standard: PROMOTION_STANDARD,
          ok: true,
          network: deploymentResult.network,
          deployment: {
            verdict_id: deploymentResult.verdict_id ?? null,
            source: deploymentSource,
            deployer: deploymentResult.deployer ?? null,
            contracts: deploymentResult.contracts,
            verification: deploymentResult.verification,
            inputs: deploymentResult.inputs ?? null,
          },
          outputs: {
            variables: allVariables,
            generic: genericVariables,
            network_scoped: networkScopedVariables,
            dotenv,
            shell,
            github_output: githubOutput,
          },
          files: {
            json: null,
            dotenv: null,
            shell: null,
            github_output: null,
          },
        }
      })()

  result.files.json = writeJsonFile(options.outputPath ?? process.env.DJD_PROMOTION_OUTPUT_PATH, result)
  result.files.dotenv = writeTextFile(
    options.dotenvPath ?? process.env.DJD_PROMOTION_DOTENV_PATH,
    result.outputs.dotenv,
  )
  result.files.shell = writeTextFile(options.shellPath ?? process.env.DJD_PROMOTION_SHELL_PATH, result.outputs.shell)
  result.files.github_output = appendTextFile(
    options.githubOutputPath ?? process.env.DJD_PROMOTION_GITHUB_OUTPUT_PATH ?? process.env[GITHUB_OUTPUT_ENV],
    result.outputs.github_output,
  )

  if (result.files.json) {
    writeJsonFile(result.files.json, result)
  }

  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  promoteEvaluatorStackDeployment()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[contracts:promote] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
