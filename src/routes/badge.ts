import { Hono } from 'hono'
import { getScoreBadge } from '../services/directoryService.js'

const badge = new Hono()

// GET /v1/badge/0x<wallet>.svg
badge.get('/:filename', (c) => {
  const outcome = getScoreBadge(c.req.param('filename'))
  if (!outcome.ok) {
    return c.text(outcome.message, outcome.status)
  }

  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=600') // 10-min cache; scores refresh hourly
  c.header('X-Content-Type-Options', 'nosniff') // prevent SVG script injection in old browsers
  return c.body(outcome.data.svg)
})

export default badge
