import type { AgentRegistrationRow } from '../types.js'
import { db } from './connection.js'

const stmtCountRegistered = db.prepare<[], { count: number }>(`
  SELECT COUNT(*) as count FROM agent_registrations
`)

const stmtUpsertRegistration = db.prepare(`
  INSERT INTO agent_registrations (wallet, name, description, github_url, website_url, registered_at, updated_at)
  VALUES (@wallet, @name, @description, @github_url, @website_url, datetime('now'), datetime('now'))
  ON CONFLICT(wallet) DO UPDATE SET
    name          = excluded.name,
    description   = excluded.description,
    github_url    = excluded.github_url,
    website_url   = excluded.website_url,
    updated_at    = datetime('now')
`)

const stmtGetRegistration = db.prepare<[string], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE wallet = ?
`)

const stmtAllRegistrationsWithGithub = db.prepare<[], AgentRegistrationRow>(`
  SELECT * FROM agent_registrations WHERE github_url IS NOT NULL
`)

const stmtUpdateGithub = db.prepare(`
  UPDATE agent_registrations
  SET github_verified    = @github_verified,
      github_stars       = @github_stars,
      github_pushed_at   = @github_pushed_at,
      github_verified_at = datetime('now')
  WHERE wallet = @wallet
`)

export function countRegisteredAgents(): number {
  return stmtCountRegistered.get()!.count
}

export function upsertRegistration(reg: {
  wallet: string
  name: string | null
  description: string | null
  github_url: string | null
  website_url: string | null
}): void {
  stmtUpsertRegistration.run(reg)
}

export function getRegistration(wallet: string): AgentRegistrationRow | undefined {
  return stmtGetRegistration.get(wallet)
}

export function getAllRegistrationsWithGithub(): AgentRegistrationRow[] {
  return stmtAllRegistrationsWithGithub.all()
}

export function updateGithubVerification(
  wallet: string,
  verified: boolean,
  stars: number | null,
  pushedAt: string | null,
): void {
  stmtUpdateGithub.run({
    wallet,
    github_verified: verified ? 1 : 0,
    github_stars: stars,
    github_pushed_at: pushedAt,
  })
}
