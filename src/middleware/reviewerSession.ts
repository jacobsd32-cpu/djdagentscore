import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

export const REVIEWER_SESSION_COOKIE = 'djd_reviewer_session'
export const REVIEWER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const REVIEWER_SESSION_VALUE = 'reviewer'

function getReviewerSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: REVIEWER_SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'Strict' as const,
    secure: process.env.NODE_ENV === 'production',
  }
}

export async function hasValidReviewerSession(c: Context): Promise<boolean> {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return false
  }

  const session = await getSignedCookie(c, adminKey, REVIEWER_SESSION_COOKIE)
  return session === REVIEWER_SESSION_VALUE
}

export async function startReviewerSession(c: Context): Promise<void> {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return
  }

  await setSignedCookie(c, REVIEWER_SESSION_COOKIE, REVIEWER_SESSION_VALUE, adminKey, getReviewerSessionCookieOptions())
}

export function clearReviewerSession(c: Context): void {
  deleteCookie(c, REVIEWER_SESSION_COOKIE, getReviewerSessionCookieOptions())
}
