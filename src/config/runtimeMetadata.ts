export type RuntimeMode = 'combined' | 'api' | 'worker'

export interface ReleaseMetadata {
  sha: string | null
  shaShort: string | null
  builtAt: string | null
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export function getRuntimeMode(): RuntimeMode {
  return process.env.DJD_RUNTIME_MODE === 'api' || process.env.DJD_RUNTIME_MODE === 'worker'
    ? process.env.DJD_RUNTIME_MODE
    : 'combined'
}

export function getReleaseMetadata(): ReleaseMetadata | undefined {
  const sha = normalizeOptionalEnv(process.env.DJD_RELEASE_SHA)?.toLowerCase() ?? null
  const builtAt = normalizeOptionalEnv(process.env.DJD_BUILD_TIMESTAMP)

  if (!sha && !builtAt) {
    return undefined
  }

  return {
    sha,
    shaShort: sha ? sha.slice(0, 7) : null,
    builtAt,
  }
}
