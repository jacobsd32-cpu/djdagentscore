/**
 * In-memory Prometheus Counters
 * Zero-dependency metrics collection for the /metrics endpoint.
 */

// ---------- HTTP request counter ----------

const httpCounts = new Map<string, number>()

/**
 * Normalize dynamic path segments so metrics don't explode per-wallet.
 * /v1/score/job/abc-123 → /v1/score/job/:id
 * /v1/badge/0xABC.svg → /v1/badge/:wallet.svg
 * /agent/0xABC → /agent/:wallet
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\/0x[0-9a-fA-F]{40}/g, '/:wallet')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
}

/**
 * Increment the HTTP request counter for a given method/path/status combo.
 */
export function incHttpRequest(method: string, path: string, status: number): void {
  const key = `${method}|${normalizePath(path)}|${status}`
  httpCounts.set(key, (httpCounts.get(key) ?? 0) + 1)
}

/**
 * Return all HTTP counters as Prometheus text lines.
 */
export function getHttpCounters(): string[] {
  const lines: string[] = []
  for (const [key, count] of httpCounts) {
    const [method, path, status] = key.split('|')
    lines.push(`djd_http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`)
  }
  return lines.sort()
}

// ---------- Startup timestamp ----------

const startedAt = Date.now()

/** Process uptime in seconds. */
export function uptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt) / 1000)
}
