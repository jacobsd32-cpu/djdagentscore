/**
 * Lightweight fetch wrapper for the DJD Agent Score API.
 *
 * Uses a simple API key (Bearer token) rather than x402 payment headers —
 * API keys have pre-paid credits so no per-request crypto signing is needed.
 */

export interface DJDClientConfig {
  baseUrl: string
  apiKey?: string
  fetch?: typeof globalThis.fetch
}

export interface DJDApiError {
  error: string
  message?: string
}

export class DJDClient {
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly fetchFn: typeof globalThis.fetch

  constructor(config: DJDClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await this.fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (response.ok) {
      return (await response.json()) as T
    }

    const errorBody = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as DJDApiError

    const message = errorBody.message ?? errorBody.error ?? `HTTP ${response.status}`

    // Return a descriptive error — 402 means the endpoint needs an API key
    if (response.status === 402) {
      throw new Error(
        `Payment required for ${path}. Set DJD_API_KEY to a valid API key with credits. (${message})`,
      )
    }

    throw new Error(`DJD API error ${response.status}: ${message}`)
  }
}
