import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { responseHeadersMiddleware } from '../../src/middleware/responseHeaders.js'
import { MODEL_VERSION } from '../../src/scoring/responseBuilders.js'

describe('responseHeadersMiddleware', () => {
  it('sets X-DJD-Model-Version to the canonical MODEL_VERSION', async () => {
    const app = new Hono()
    app.use('*', responseHeadersMiddleware)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.headers.get('X-DJD-Model-Version')).toBe(MODEL_VERSION)
    expect(MODEL_VERSION).toBe('2.5.0')
  })
})
