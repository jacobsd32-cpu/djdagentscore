import { describe, it, expect, vi } from 'vitest'
import { DJDClient } from '../src/client.js'

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  }) as unknown as typeof globalThis.fetch
}

describe('DJDClient', () => {
  it('sends GET request to correct URL', async () => {
    const fetchFn = mockFetch(200, { score: 85 })
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    const result = await client.get('/v1/score/basic?wallet=0x123')

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/score/basic?wallet=0x123',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result).toEqual({ score: 85 })
  })

  it('sends POST request with JSON body', async () => {
    const fetchFn = mockFetch(200, { results: [] })
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    await client.post('/v1/score/batch', { wallets: ['0xabc'] })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/score/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ wallets: ['0xabc'] }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('includes Authorization header when apiKey is set', async () => {
    const fetchFn = mockFetch(200, {})
    const client = new DJDClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'djd_live_test123',
      fetch: fetchFn,
    })

    await client.get('/v1/leaderboard')

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer djd_live_test123' }),
      }),
    )
  })

  it('omits Authorization header when no apiKey', async () => {
    const fetchFn = mockFetch(200, {})
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    await client.get('/v1/leaderboard')

    const calledHeaders = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(calledHeaders.Authorization).toBeUndefined()
  })

  it('strips trailing slashes from baseUrl', async () => {
    const fetchFn = mockFetch(200, {})
    const client = new DJDClient({ baseUrl: 'https://api.example.com///', fetch: fetchFn })

    await client.get('/v1/test')

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/test',
      expect.anything(),
    )
  })

  it('throws descriptive error on 402 (payment required)', async () => {
    const fetchFn = mockFetch(402, { error: 'payment_required', message: 'x402 payment needed' })
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    await expect(client.get('/v1/score/full?wallet=0x123')).rejects.toThrow('DJD_API_KEY')
  })

  it('throws on 4xx errors', async () => {
    const fetchFn = mockFetch(400, { error: 'invalid_wallet', message: 'Bad wallet' })
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    await expect(client.get('/v1/score/basic?wallet=invalid')).rejects.toThrow('Bad wallet')
  })

  it('throws on 5xx errors', async () => {
    const fetchFn = mockFetch(500, { error: 'internal_error' })
    const client = new DJDClient({ baseUrl: 'https://api.example.com', fetch: fetchFn })

    await expect(client.get('/v1/test')).rejects.toThrow('DJD API error 500')
  })
})
