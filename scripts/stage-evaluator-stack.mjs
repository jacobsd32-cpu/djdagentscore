import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runEvaluatorStackDeployment } from './deploy-evaluator-stack.mjs'
import { runPostDeploySmokeCheck } from './post-deploy-smoke.mjs'
import { runEvaluatorStackPreflight } from './preflight-evaluator-stack.mjs'
import { promoteEvaluatorStackDeployment } from './promote-evaluator-stack.mjs'
import { publishEvaluatorStackDeployment } from './publish-evaluator-stack.mjs'
import { runEvaluatorStackSmoke } from './smoke-evaluator-stack.mjs'
import { verifyEvaluatorStackDeployment } from './verify-evaluator-stack.mjs'

function writeStageReport(outputPath, report) {
  if (typeof outputPath !== 'string' || outputPath.trim().length === 0) {
    return
  }

  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
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

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: 'Error',
  }
}

function summarizePreflightFailure(result) {
  const failures = []
  if (!result?.bundle?.ready) failures.push('bundle')
  if (!result?.rpc?.ready || !result?.rpc?.reachable || result?.rpc?.chain_id_matches_expected !== true) {
    failures.push('rpc')
  }
  if (!result?.deployer?.ready) failures.push('deployer')
  return failures.join(', ') || 'unknown'
}

function resolvePromotionPaths(options = {}) {
  return {
    outputPath:
      options.promotionOutputPath ??
      process.env.DJD_STAGE_PROMOTION_OUTPUT_PATH ??
      process.env.DJD_PROMOTION_OUTPUT_PATH ??
      null,
    dotenvPath:
      options.promotionDotenvPath ??
      process.env.DJD_STAGE_PROMOTION_DOTENV_PATH ??
      process.env.DJD_PROMOTION_DOTENV_PATH ??
      null,
    shellPath:
      options.promotionShellPath ??
      process.env.DJD_STAGE_PROMOTION_SHELL_PATH ??
      process.env.DJD_PROMOTION_SHELL_PATH ??
      null,
    githubOutputPath:
      options.promotionGithubOutputPath ??
      process.env.DJD_STAGE_PROMOTION_GITHUB_OUTPUT_PATH ??
      process.env.DJD_PROMOTION_GITHUB_OUTPUT_PATH ??
      process.env.GITHUB_OUTPUT ??
      null,
  }
}

function hasPromotionSink(paths) {
  return Object.values(paths).some((value) => typeof value === 'string' && value.trim().length > 0)
}

export async function runEvaluatorStackStage(options = {}) {
  const startedAt = new Date().toISOString()
  const outputPath = options.outputPath ?? process.env.DJD_STAGE_REPORT_PATH
  const runHealth = normalizeBoolean(
    options.runHealth ?? process.env.DJD_STAGE_RUN_HEALTH,
    Boolean(options.health ?? process.env.DJD_HEALTHCHECK_URL),
  )
  const runPublish = normalizeBoolean(options.publishRegistry ?? process.env.DJD_STAGE_PUBLISH_REGISTRY, false)
  const promotionPaths = resolvePromotionPaths(options)
  const runPromote = normalizeBoolean(
    options.promote ?? process.env.DJD_STAGE_PROMOTE,
    runPublish || hasPromotionSink(promotionPaths),
  )

  const report = {
    standard: 'djd-evaluator-stage-report-v1',
    started_at: startedAt,
    finished_at: null,
    ok: false,
    steps: {
      preflight: {
        ok: false,
        skipped: false,
        result: null,
        error: null,
      },
      deploy: {
        ok: false,
        skipped: false,
        result: null,
        error: null,
      },
      verify: {
        ok: false,
        skipped: false,
        result: null,
        error: null,
      },
      smoke: {
        ok: false,
        skipped: false,
        result: null,
        error: null,
      },
      health: {
        ok: false,
        skipped: !runHealth,
        result: null,
        error: null,
      },
      publish: {
        ok: false,
        skipped: !runPublish,
        result: null,
        error: null,
      },
      promote: {
        ok: false,
        skipped: !runPromote,
        result: null,
        error: null,
      },
    },
  }

  const finalize = () => {
    report.finished_at = new Date().toISOString()
    report.ok =
      report.steps.preflight.ok &&
      report.steps.deploy.ok &&
      report.steps.verify.ok &&
      report.steps.smoke.ok &&
      (report.steps.health.skipped || report.steps.health.ok) &&
      (report.steps.publish.skipped || report.steps.publish.ok) &&
      (report.steps.promote.skipped || report.steps.promote.ok)
    writeStageReport(outputPath, report)
    return report
  }

  try {
    const preflightResult = await runEvaluatorStackPreflight(options)
    report.steps.preflight.ok = preflightResult.ok
    report.steps.preflight.result = preflightResult
    if (!preflightResult.ok) {
      report.steps.preflight.error = {
        message: `Preflight failed: ${summarizePreflightFailure(preflightResult)}`,
        name: 'PreflightError',
      }
      report.steps.deploy.skipped = true
      report.steps.verify.skipped = true
      report.steps.smoke.skipped = true
      report.steps.health.skipped = true
      report.steps.publish.skipped = true
      report.steps.promote.skipped = true
      return finalize()
    }
  } catch (error) {
    report.steps.preflight.error = serializeError(error)
    report.steps.deploy.skipped = true
    report.steps.verify.skipped = true
    report.steps.smoke.skipped = true
    report.steps.health.skipped = true
    report.steps.publish.skipped = true
    report.steps.promote.skipped = true
    return finalize()
  }

  let deploymentResult
  try {
    deploymentResult = await runEvaluatorStackDeployment(options)
    report.steps.deploy.ok = true
    report.steps.deploy.result = deploymentResult
  } catch (error) {
    report.steps.deploy.error = serializeError(error)
    report.steps.verify.skipped = true
    report.steps.smoke.skipped = true
    report.steps.health.skipped = true
    report.steps.publish.skipped = true
    report.steps.promote.skipped = true
    return finalize()
  }

  let verifyResult
  try {
    verifyResult = await verifyEvaluatorStackDeployment({
      ...options,
      deploymentResult,
    })
    report.steps.verify.ok = verifyResult.ok
    report.steps.verify.result = verifyResult
    if (!verifyResult.ok) {
      report.steps.verify.error = {
        message: `Verification failed: ${verifyResult.failed_checks.join(', ')}`,
        name: 'VerificationError',
      }
      report.steps.smoke.skipped = true
      report.steps.health.skipped = true
      report.steps.publish.skipped = true
      report.steps.promote.skipped = true
      return finalize()
    }
  } catch (error) {
    report.steps.verify.error = serializeError(error)
    report.steps.smoke.skipped = true
    report.steps.health.skipped = true
    report.steps.publish.skipped = true
    report.steps.promote.skipped = true
    return finalize()
  }

  try {
    const smokeResult = await runEvaluatorStackSmoke({
      ...options,
      deploymentResult,
    })
    report.steps.smoke.ok = smokeResult.ok
    report.steps.smoke.result = smokeResult
    if (!smokeResult.ok) {
      report.steps.smoke.error = {
        message: 'Evaluator smoke step reported ok=false',
        name: 'SmokeError',
      }
      report.steps.health.skipped = true
      report.steps.publish.skipped = true
      report.steps.promote.skipped = true
      return finalize()
    }
  } catch (error) {
    report.steps.smoke.error = serializeError(error)
    report.steps.health.skipped = true
    report.steps.publish.skipped = true
    report.steps.promote.skipped = true
    return finalize()
  }

  if (!runHealth) {
    if (!runPublish && !runPromote) {
      return finalize()
    }
  } else {
    try {
      await runPostDeploySmokeCheck(options.health ?? options)
      report.steps.health.ok = true
      report.steps.health.result = {
        checked: true,
      }
    } catch (error) {
      report.steps.health.error = serializeError(error)
      report.steps.publish.skipped = true
      report.steps.promote.skipped = true
      return finalize()
    }
  }

  if (runPublish) {
    try {
      const publishResult = await publishEvaluatorStackDeployment({
        ...options,
        deploymentResult,
        checks: {
          preflight: report.steps.preflight.ok,
          verified: report.steps.verify.ok,
          smoked: report.steps.smoke.ok,
          health: runHealth ? report.steps.health.ok : null,
          staged: true,
        },
      })
      report.steps.publish.ok = publishResult.ok
      report.steps.publish.result = publishResult
    } catch (error) {
      report.steps.publish.error = serializeError(error)
      report.steps.promote.skipped = true
      return finalize()
    }
  }

  if (!runPromote) {
    return finalize()
  }

  try {
    const promoteResult = await promoteEvaluatorStackDeployment(
      report.steps.publish.ok
        ? {
            network: deploymentResult.network?.key ?? options.network ?? null,
            deploymentResult: null,
            deploymentResultPath: '',
            registryPath: options.registryPath ?? process.env.DJD_EVALUATOR_DEPLOYMENTS_PATH,
            apiBaseUrl: options.apiBaseUrl,
            outputPath: promotionPaths.outputPath,
            dotenvPath: promotionPaths.dotenvPath,
            shellPath: promotionPaths.shellPath,
            githubOutputPath: promotionPaths.githubOutputPath,
          }
        : {
            deploymentResult,
            apiBaseUrl: options.apiBaseUrl,
            outputPath: promotionPaths.outputPath,
            dotenvPath: promotionPaths.dotenvPath,
            shellPath: promotionPaths.shellPath,
            githubOutputPath: promotionPaths.githubOutputPath,
          },
    )
    report.steps.promote.ok = promoteResult.ok
    report.steps.promote.result = promoteResult
  } catch (error) {
    report.steps.promote.error = serializeError(error)
    return finalize()
  }

  return finalize()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvaluatorStackStage()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (!report.ok) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error(`[contracts:stage] FAILED: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
