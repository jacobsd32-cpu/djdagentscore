import { pathToFileURL } from 'node:url'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeRuntimeMode(value) {
  const mode = (value ?? 'combined').toLowerCase()
  if (!['combined', 'api', 'worker'].includes(mode)) {
    throw new Error(`Invalid expected runtime mode "${value}". Expected combined, api, or worker.`)
  }
  return mode
}

function normalizeReleaseSha(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function validatePublicHealthPayload(payload, expectedReleaseSha = null) {
  if (!payload || payload.status !== 'ok') {
    throw new Error('Public /health payload did not return status=ok')
  }
  if (typeof payload.version !== 'string' || payload.version.length === 0) {
    throw new Error('Public /health payload did not include a version string')
  }
  if (typeof payload.uptime !== 'number' || Number.isNaN(payload.uptime)) {
    throw new Error('Public /health payload did not include numeric uptime')
  }

  const normalizedExpectedReleaseSha = normalizeReleaseSha(expectedReleaseSha)
  if (!normalizedExpectedReleaseSha) {
    return
  }

  if (!payload.release || typeof payload.release.sha !== 'string') {
    throw new Error('Public /health payload did not include release metadata')
  }

  const normalizedActualReleaseSha = normalizeReleaseSha(payload.release.sha)

  if (!normalizedActualReleaseSha) {
    throw new Error('Public /health payload did not include a valid release SHA')
  }

  if (normalizedActualReleaseSha !== normalizedExpectedReleaseSha) {
    throw new Error(
      `Release SHA mismatch: expected ${normalizedExpectedReleaseSha}, got ${normalizedActualReleaseSha}`,
    )
  }
}

export function validateDetailedHealthPayload(payload, expectedRuntimeMode) {
  if (!payload || payload.status !== 'ok') {
    throw new Error('Detailed /health payload did not return status=ok')
  }
  if (payload.experimentalStatus !== true) {
    throw new Error('Detailed /health payload did not include experimentalStatus=true')
  }
  if (typeof payload.modelVersion !== 'string' || payload.modelVersion.length === 0) {
    throw new Error('Detailed /health payload did not include modelVersion')
  }
  if (!payload.runtime || typeof payload.runtime.mode !== 'string') {
    throw new Error('Detailed /health payload did not include runtime metadata')
  }

  const expectedApiEnabled = expectedRuntimeMode !== 'worker'
  const expectedWorkerEnabled = expectedRuntimeMode !== 'api'

  if (payload.runtime.mode !== expectedRuntimeMode) {
    throw new Error(`Runtime mode mismatch: expected ${expectedRuntimeMode}, got ${payload.runtime.mode}`)
  }
  if (payload.runtime.apiEnabled !== expectedApiEnabled) {
    throw new Error(`Runtime apiEnabled mismatch for mode ${expectedRuntimeMode}`)
  }
  if (payload.runtime.workerEnabled !== expectedWorkerEnabled) {
    throw new Error(`Runtime workerEnabled mismatch for mode ${expectedRuntimeMode}`)
  }
}

function formatHealthWarnings(payload) {
  if (!Array.isArray(payload?.warnings) || payload.warnings.length === 0) {
    return null
  }

  return payload.warnings
    .map((warning) => {
      if (!warning || typeof warning.message !== 'string') {
        return null
      }

      const code = typeof warning.code === 'string' && warning.code.length > 0 ? `${warning.code}: ` : ''
      return `${code}${warning.message}`
    })
    .filter(Boolean)
    .join(' | ')
}

export async function runPostDeploySmokeCheck(options = {}) {
  const healthUrl = options.healthUrl ?? process.env.DJD_HEALTHCHECK_URL ?? 'https://djdagentscore.dev/health'
  const adminKey = options.adminKey ?? process.env.DJD_ADMIN_KEY ?? ''
  const expectedRuntimeMode = normalizeRuntimeMode(
    options.expectedRuntimeMode ?? process.env.DJD_EXPECT_RUNTIME_MODE ?? 'combined',
  )
  const expectedReleaseSha = normalizeReleaseSha(
    options.expectedReleaseSha ?? process.env.DJD_EXPECT_RELEASE_SHA ?? '',
  )
  const timeoutMs = Number.parseInt(
    String(options.timeoutMs ?? process.env.DJD_DEPLOY_SMOKE_TIMEOUT_MS ?? '180000'),
    10,
  )
  const intervalMs = Number.parseInt(
    String(options.intervalMs ?? process.env.DJD_DEPLOY_SMOKE_INTERVAL_MS ?? '5000'),
    10,
  )

  const startedAt = Date.now()
  let attempt = 0
  let lastError = null

  while (Date.now() - startedAt <= timeoutMs) {
    attempt += 1
    try {
      const publicResponse = await fetch(healthUrl)
      if (!publicResponse.ok) {
        throw new Error(`Public /health returned HTTP ${publicResponse.status}`)
      }
      const publicPayload = await publicResponse.json()
      validatePublicHealthPayload(publicPayload, expectedReleaseSha)

      if (adminKey) {
        const detailedResponse = await fetch(healthUrl, {
          headers: { 'x-admin-key': adminKey },
        })
        if (!detailedResponse.ok) {
          throw new Error(`Admin /health returned HTTP ${detailedResponse.status}`)
        }
        const detailedPayload = await detailedResponse.json()
        validateDetailedHealthPayload(detailedPayload, expectedRuntimeMode)
        console.log(
          `[smoke] OK after ${attempt} attempt(s): public + admin health verified for runtime=${expectedRuntimeMode}${expectedReleaseSha ? ` release=${expectedReleaseSha.slice(0, 7)}` : ''}`,
        )
        const warningSummary = formatHealthWarnings(detailedPayload)
        if (warningSummary) {
          console.log(`[smoke] Admin health warnings: ${warningSummary}`)
        }
      } else {
        console.log(
          `[smoke] OK after ${attempt} attempt(s): public health verified${expectedReleaseSha ? ` release=${expectedReleaseSha.slice(0, 7)}` : ''} (admin runtime verification skipped; DJD_ADMIN_KEY not set)`,
        )
      }

      return
    } catch (error) {
      lastError = error
      const elapsed = Date.now() - startedAt
      console.log(
        `[smoke] attempt ${attempt} failed after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (elapsed + intervalMs > timeoutMs) break
      await sleep(intervalMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Post-deploy smoke check failed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPostDeploySmokeCheck().catch((error) => {
    console.error(`[smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
