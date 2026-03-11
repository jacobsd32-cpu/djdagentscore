export function assertEnv(key: string, opts?: { minLength?: number }): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  if (opts?.minLength && val.length < opts.minLength) {
    throw new Error(`${key} must be at least ${opts.minLength} characters`)
  }
  return val
}

export function envEnabled(key: string, defaultValue = true): boolean {
  const value = process.env[key]
  if (value === undefined) return defaultValue
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

export function warnMissingGithubToken(): void {
  if (!process.env.GITHUB_TOKEN) {
    console.warn('[config] GITHUB_TOKEN not set — GitHub verification limited to 60 req/hr')
  }
}
