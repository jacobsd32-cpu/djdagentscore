import { Hono } from 'hono'
import { errorResponse } from '../errors.js'
import { getClusterView } from '../services/clusterService.js'

const cluster = new Hono()

cluster.get('/', async (c) => {
  const outcome = await getClusterView({
    rawWallet: c.req.query('wallet'),
    limit: c.req.query('limit'),
  })
  if (!outcome.ok) {
    return c.json(errorResponse(outcome.code, outcome.message, outcome.details), outcome.status)
  }

  return c.json(outcome.data)
})

export default cluster
