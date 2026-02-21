import { Hono } from 'hono'
import { upsertRegistration, getRegistration } from '../db.js'
import type { Address, AgentRegistrationBody, AgentRegistrationResponse } from '../types.js'

function isValidAddress(addr: string): addr is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

const register = new Hono()

// POST /v1/agent/register
register.post('/', async (c) => {
  let body: AgentRegistrationBody
  try {
    body = await c.req.json<AgentRegistrationBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { wallet, name, description, github_url, website_url } = body

  if (!wallet || !isValidAddress(wallet)) {
    return c.json({ error: 'Invalid or missing wallet address' }, 400)
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return c.json({ error: 'name must be a non-empty string' }, 400)
  }
  if (description !== undefined && typeof description !== 'string') {
    return c.json({ error: 'description must be a string' }, 400)
  }
  if (github_url !== undefined && !isValidUrl(github_url)) {
    return c.json({ error: 'github_url must be a valid URL' }, 400)
  }
  if (website_url !== undefined && !isValidUrl(website_url)) {
    return c.json({ error: 'website_url must be a valid URL' }, 400)
  }

  const normalizedWallet = wallet.toLowerCase()
  const existing = getRegistration(normalizedWallet)
  const isNew = !existing

  // Merge: omitted fields retain existing values; explicit null/empty clears them
  upsertRegistration({
    wallet: normalizedWallet,
    name:        name        !== undefined ? (name?.trim().slice(0, 100) ?? null)        : (existing?.name ?? null),
    description: description !== undefined ? (description?.trim().slice(0, 500) ?? null) : (existing?.description ?? null),
    github_url:  github_url  !== undefined ? (github_url?.slice(0, 200) ?? null)         : (existing?.github_url ?? null),
    website_url: website_url !== undefined ? (website_url?.slice(0, 200) ?? null)        : (existing?.website_url ?? null),
  })

  const row = getRegistration(normalizedWallet)!

  const response: AgentRegistrationResponse = {
    wallet: normalizedWallet as Address,
    status: isNew ? 'registered' : 'updated',
    registeredAt: row.registered_at,
    name: row.name,
    description: row.description,
    github_url: row.github_url,
    website_url: row.website_url,
  }

  return c.json(response, isNew ? 201 : 200)
})

export default register
