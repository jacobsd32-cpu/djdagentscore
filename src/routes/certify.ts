import { Hono } from 'hono'
import { certifyPageHtml } from '../templates/certify.js'

const certify = new Hono()

certify.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(certifyPageHtml())
})

export default certify
