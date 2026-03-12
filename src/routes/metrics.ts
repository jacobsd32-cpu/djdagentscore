/**
 * GET /metrics — Prometheus-compatible metrics endpoint.
 * Returns plain text in Prometheus exposition format.
 * No payment required.
 */
import { Hono } from 'hono'
import { getPrometheusMetricsPayload } from '../services/opsService.js'

const metrics = new Hono()

metrics.get('/', (c) => {
  c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  c.header('Cache-Control', 'no-cache')
  return c.body(getPrometheusMetricsPayload())
})

export default metrics
