/**
 * .well-known/x402 — Discovery document for x402-capable agents.
 *
 * Any agent crawling a domain for x402-enabled services will check
 * `/.well-known/x402` first. This returns a machine-readable manifest
 * of every paid endpoint, its pricing, input schema, and capabilities.
 *
 * Spec: https://x402.org/docs/discovery
 */

import { Hono } from 'hono'
import { getX402DiscoveryView } from '../services/discoveryService.js'

const wellKnown = new Hono()

wellKnown.get('/', (c) => {
  return c.json(getX402DiscoveryView(c.req.url, c.req.header('x-forwarded-proto')))
})

export default wellKnown
