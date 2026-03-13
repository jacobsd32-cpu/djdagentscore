import { Hono } from 'hono'
import { directoryPageHtml } from '../templates/directory.js'

const directory = new Hono()

directory.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=300')
  return c.body(
    directoryPageHtml({
      limit: c.req.query('limit'),
      tier: c.req.query('tier'),
      search: c.req.query('search'),
      sort: c.req.query('sort'),
    }),
  )
})

export default directory
