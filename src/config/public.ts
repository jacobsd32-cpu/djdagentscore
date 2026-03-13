const DEFAULT_PUBLIC_BASE_URL = 'https://djdagentscore.dev'
const DEFAULT_SUPPORT_EMAIL = 'drewjacobs32@gmail.com'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function getPublicBaseUrl(): string {
  return stripTrailingSlash(process.env.PUBLIC_BASE_URL ?? process.env.BILLING_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL)
}

export function buildPublicUrl(path = ''): string {
  const baseUrl = getPublicBaseUrl()
  if (!path) return baseUrl
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function getPublicOrigin(): string {
  return new URL(getPublicBaseUrl()).origin
}

export function getSupportEmail(): string {
  return process.env.PUBLIC_SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL
}
