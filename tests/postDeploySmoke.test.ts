import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runPostDeploySmokeCheck,
  validateDetailedHealthPayload,
  validatePublicMetricsLockdown,
  validatePublicHealthPayload,
} from '../scripts/post-deploy-smoke.mjs'

describe('post-deploy smoke helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts valid public health payloads', () => {
    expect(() =>
      validatePublicHealthPayload({
        status: 'ok',
        version: '2.5.0',
        uptime: 12,
        release: {
          sha: 'abcdef1234567890',
          shaShort: 'abcdef1',
          builtAt: '2026-03-13T02:30:00Z',
        },
      }),
    ).not.toThrow()
  })

  it('rejects public health payloads that leak detailed runtime fields', () => {
    expect(() =>
      validatePublicHealthPayload({
        status: 'ok',
        version: '2.5.0',
        uptime: 12,
        modelVersion: '2.5.0',
      }),
    ).toThrow(/leaked detailed field "modelVersion"/)
  })

  it('accepts valid detailed health payloads for combined runtime', () => {
    expect(() =>
      validateDetailedHealthPayload(
        {
          status: 'ok',
          modelVersion: '2.5.0',
          experimentalStatus: true,
          runtime: {
            mode: 'combined',
            apiEnabled: true,
            workerEnabled: true,
          },
        },
        'combined',
      ),
    ).not.toThrow()
  })

  it('rejects public metrics that are exposed without auth', () => {
    expect(() => validatePublicMetricsLockdown(200)).toThrow(/Public \/metrics returned HTTP 200/)
    expect(() => validatePublicMetricsLockdown(401)).not.toThrow()
  })

  it('retries through transient failures and succeeds once health is good', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchMock = async (url, init) => {
      const target = typeof url === 'string' ? url : String(url)

      if (target === 'https://example.test/health' && !init?.headers?.['x-admin-key']) {
        fetchMock.publicHealthAttempts = (fetchMock.publicHealthAttempts ?? 0) + 1
        if (fetchMock.publicHealthAttempts === 1) {
          return {
            ok: false,
            status: 503,
          }
        }

        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            version: '2.5.0',
            uptime: 10,
            release: {
              sha: 'abcdef1234567890',
              shaShort: 'abcdef1',
              builtAt: '2026-03-13T02:30:00Z',
            },
          }),
        }
      }

      if (target === 'https://example.test/metrics') {
        return {
          ok: false,
          status: 401,
        }
      }

      if (target === 'https://example.test/robots.txt') {
        return {
          ok: true,
          text: async () => 'User-agent: *\nSitemap: https://example.test/sitemap.xml\n',
        }
      }

      if (target === 'https://example.test/sitemap.xml') {
        return {
          ok: true,
          text: async () =>
            '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.test/</loc></url></urlset>',
        }
      }

      if (target === 'https://example.test/.well-known/agent.json') {
        return {
          ok: true,
          json: async () => ({
            url: 'https://example.test',
            docs: 'https://example.test/docs',
            openapi: 'https://example.test/openapi.json',
            payment: {
              discovery: 'https://example.test/.well-known/x402',
            },
          }),
        }
      }

      if (target === 'https://example.test/health' && init?.headers?.['x-admin-key']) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            modelVersion: '2.5.0',
            experimentalStatus: true,
            warnings: [
              {
                code: 'github_token_missing',
                message: 'GITHUB_TOKEN not set — GitHub verification is limited to unauthenticated rate limits.',
              },
            ],
            runtime: {
              mode: 'combined',
              apiEnabled: true,
              workerEnabled: true,
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch target in smoke test: ${target}`)
    }

    const originalFetch = globalThis.fetch
    // @ts-expect-error test stub
    globalThis.fetch = fetchMock

    await expect(
      runPostDeploySmokeCheck({
        healthUrl: 'https://example.test/health',
        adminKey: 'secret',
        expectedRuntimeMode: 'combined',
        expectedReleaseSha: 'abcdef1234567890',
        timeoutMs: 2000,
        intervalMs: 1,
      }),
    ).resolves.toBeUndefined()

    globalThis.fetch = originalFetch
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[smoke] Admin health warnings: github_token_missing: GITHUB_TOKEN not set — GitHub verification is limited to unauthenticated rate limits.',
      ),
    )
  })

  it('rejects a release SHA mismatch when one is expected', () => {
    expect(() =>
      validatePublicHealthPayload(
        {
          status: 'ok',
          version: '2.5.0',
          uptime: 12,
          release: {
            sha: 'deadbeef12345678',
            shaShort: 'deadbee',
            builtAt: '2026-03-13T02:30:00Z',
          },
        },
        'abcdef1234567890',
      ),
    ).toThrow(/Release SHA mismatch/)
  })
})
