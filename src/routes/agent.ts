import { Hono } from 'hono'
import { getAgentProfilePage } from '../services/agentProfileService.js'

const agentRoute = new Hono()

agentRoute.get('/:wallet', async (c) => {
  const outcome = await getAgentProfilePage(c.req.param('wallet'), new URL(c.req.url).origin)
  if (!outcome.ok) {
    return c.text(outcome.message, outcome.status)
  }

  return c.html(outcome.data.html)
})

export default agentRoute
