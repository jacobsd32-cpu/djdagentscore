import { Hono } from 'hono'
import { explorerHtml } from '../templates/explorer.js'

const explorer = new Hono()

explorer.get('/', (c) => c.html(explorerHtml))

export default explorer
