import { Hono } from 'hono'
import { reviewerPageHtml } from '../templates/reviewer.js'

const reviewer = new Hono()

reviewer.get('/', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8')
  c.header('Cache-Control', 'no-store')
  return c.body(reviewerPageHtml())
})

export default reviewer
