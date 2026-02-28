import { Hono } from 'hono'
import { BILLING_PLANS } from '../config/plans.js'
import { pricingPageHtml } from '../templates/pricing.js'

const pricing = new Hono()

pricing.get('/', (c) => {
  const plans = Object.values(BILLING_PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    monthlyPrice: p.monthlyPrice,
    monthlyLimit: p.monthlyLimit,
  }))

  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(pricingPageHtml(plans))
})

export default pricing
