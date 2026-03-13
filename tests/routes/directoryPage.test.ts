import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import directoryRoute from '../../src/routes/directory.js'

describe('GET /directory', () => {
  it('renders the trusted endpoint directory page', async () => {
    const app = new Hono()
    app.route('/directory', directoryRoute)

    const res = await app.request('/directory?search=alpha&sort=name&tier=Trusted&limit=12')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')

    const body = await res.text()
    expect(body).toContain('Trusted Endpoint Directory')
    expect(body).toContain('inspectable trust surfaces')
    expect(body).toContain('/v1/certification/directory')
    expect(body).toContain('Search certified agents, wallets, bios, GitHub, or websites')
    expect(body).toContain('value="alpha"')
    expect(body).toContain('option value="name" selected')
    expect(body).toContain('option value="Trusted" selected')
    expect(body).toContain('option value="12" selected')
  })
})
