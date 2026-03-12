import { Hono } from 'hono'
import { getOpenApiSpecView, getPublicDiscoveryCacheControl } from '../services/discoveryService.js'

const openapi = new Hono()

openapi.get('/', (c) => {
  c.header('Content-Type', 'application/json')
  c.header('Cache-Control', getPublicDiscoveryCacheControl())
  return c.body(getOpenApiSpecView())
})

export default openapi
