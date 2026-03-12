import type { Context } from 'hono'
import { Hono } from 'hono'

import { errorResponse } from '../errors.js'
import {
  createMonitoringSubscription,
  deactivateMonitoringSubscription,
  listMonitoringPolicyPresets,
  listMonitoringSubscriptions,
} from '../services/monitoringService.js'
import type { AppEnv } from '../types/hono-env.js'

function getApiKeyWallet(c: Context): string | null {
  return (c as Context<AppEnv>).get('apiKeyWallet') ?? null
}

const monitoringRoute = new Hono()

monitoringRoute.get('/presets', (c) => {
  const presets = listMonitoringPolicyPresets()
  return c.json({ presets, count: presets.length })
})

monitoringRoute.post('/', async (c) => {
  const outcome = createMonitoringSubscription(getApiKeyWallet(c), await c.req.json().catch(() => null))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data, outcome.status ?? 201)
})

monitoringRoute.get('/', (c) => {
  const outcome = listMonitoringSubscriptions(getApiKeyWallet(c))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

monitoringRoute.delete('/:id', (c) => {
  const outcome = deactivateMonitoringSubscription(getApiKeyWallet(c), c.req.param('id'))
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default monitoringRoute
