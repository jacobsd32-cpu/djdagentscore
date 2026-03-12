import { Hono } from 'hono'
import { getDocsHtmlView, getPublicDiscoveryCacheControl } from '../services/discoveryService.js'

const docs = new Hono()

docs.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', getPublicDiscoveryCacheControl())
  return c.body(getDocsHtmlView())
})

export default docs
