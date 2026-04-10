import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY_PATH = join(__dirname, '..', 'data', 'evaluator-deployments.json')

function readJsonFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`Missing ${label}`)
  }

  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? '')
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function validateDeploymentResult(result) {
  if (!result || result.standard !== 'djd-evaluator-deploy-result-v1') {
    throw new Error('Invalid deployment result payload')
  }
  if (!result.network?.chain_id || !result.network?.chain_name) {
    throw new Error('Deployment result is missing network metadata')
  }
  if (!isAddress(result.contracts?.verifier?.address ?? '')) {
    throw new Error('Deployment result is missing verifier address')
  }
  if (!isAddress(result.contracts?.escrow?.address ?? '')) {
    throw new Error('Deployment result is missing escrow address')
  }
  if (!isAddress(result.verification?.oracle_signer ?? '')) {
    throw new Error('Deployment result is missing oracle signer verification metadata')
  }
  return result
}

function validateStageReport(report) {
  if (!report || report.standard !== 'djd-evaluator-stage-report-v1') {
    throw new Error('Invalid stage report payload')
  }
  return report
}

function getRegistryPath(options = {}) {
  const configuredPath = options.registryPath ?? process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH
  return typeof configuredPath === 'string' && configuredPath.trim().length > 0
    ? configuredPath.trim()
    : DEFAULT_REGISTRY_PATH
}

function loadRegistry(path) {
  if (!existsSync(path)) {
    return {
      standard: 'djd-evaluator-deployment-registry-v1',
      updated_at: null,
      deployments: {},
    }
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed.standard !== 'djd-evaluator-deployment-registry-v1' || typeof parsed.deployments !== 'object') {
    throw new Error('Invalid deployment registry payload')
  }
  return parsed
}

function deriveChecks(options = {}) {
  if (options.checks && typeof options.checks === 'object') {
    return {
      preflight: options.checks.preflight ?? null,
      verified: options.checks.verified ?? null,
      smoked: options.checks.smoked ?? null,
      health: options.checks.health ?? null,
      staged: options.checks.staged ?? null,
    }
  }

  const stageReport = options.stageReport
  if (!stageReport) {
    return {
      preflight: null,
      verified: null,
      smoked: null,
      health: null,
      staged: null,
    }
  }

  return {
    preflight: stageReport.steps?.preflight?.ok ?? null,
    verified: stageReport.steps?.verify?.ok ?? null,
    smoked: stageReport.steps?.smoke?.ok ?? null,
    health: stageReport.steps?.health?.skipped ? null : stageReport.steps?.health?.ok ?? null,
    staged: stageReport.ok ?? null,
  }
}

function buildRegistryEntry(deploymentResult, checks, publishedAt) {
  return {
    published_at: publishedAt,
    network: deploymentResult.network,
    verdict_id: deploymentResult.verdict_id ?? null,
    deployer: deploymentResult.deployer ?? null,
    contracts: deploymentResult.contracts,
    verification: deploymentResult.verification,
    inputs: deploymentResult.inputs,
    explorer: deploymentResult.explorer ?? null,
    links: deploymentResult.links ?? {},
    checks,
  }
}

export async function publishEvaluatorStackDeployment(options = {}) {
  const deploymentResult = validateDeploymentResult(
    options.deploymentResult ??
      readJsonFile(options.deploymentResultPath ?? process.env.DJD_DEPLOY_RESULT_PATH, 'DJD_DEPLOY_RESULT_PATH'),
  )
  const stageReport =
    options.stageReport ??
    (options.stageReportPath ?? process.env.DJD_STAGE_REPORT_PATH
      ? validateStageReport(readJsonFile(options.stageReportPath ?? process.env.DJD_STAGE_REPORT_PATH, 'DJD_STAGE_REPORT_PATH'))
      : null)
  const allowPartial = normalizeBoolean(options.allowPartial ?? process.env.DJD_PUBLISH_ALLOW_PARTIAL, false)
  const checks = deriveChecks({
    checks: options.checks,
    stageReport,
  })

  if (!allowPartial && (checks.preflight !== true || checks.verified !== true || checks.smoked !== true)) {
    throw new Error('Publishing requires successful preflight, verify, and smoke checks or DJD_PUBLISH_ALLOW_PARTIAL=true')
  }

  const registryPath = getRegistryPath(options)
  const registry = loadRegistry(registryPath)
  const networkKey = deploymentResult.network?.key ?? String(deploymentResult.network?.chain_id ?? 'unknown')
  const publishedAt = options.publishedAt ?? new Date().toISOString()
  const replacing = Object.prototype.hasOwnProperty.call(registry.deployments, networkKey)

  registry.deployments[networkKey] = buildRegistryEntry(deploymentResult, checks, publishedAt)
  registry.updated_at = publishedAt

  mkdirSync(dirname(registryPath), { recursive: true })
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')

  return {
    standard: 'djd-evaluator-deployment-publish-v1',
    ok: true,
    registry_path: registryPath,
    published_at: publishedAt,
    network: deploymentResult.network,
    replacing,
    checks,
    deployment: registry.deployments[networkKey],
    registry_summary: {
      updated_at: registry.updated_at,
      deployment_count: Object.keys(registry.deployments).length,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishEvaluatorStackDeployment()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[contracts:publish] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
