export const DEFAULT_POST_LOGIN_PATH = '/portal'
export const ADMIN_POST_LOGIN_PATH = '/admin'

export function isAdminSubdomain(host: string): boolean {
  return host.toLowerCase().startsWith('admin.')
}

export function normalizeNextPath(next: string | null | undefined, fallback = DEFAULT_POST_LOGIN_PATH) {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  return next
}

export function buildOAuthCallbackUrl(origin: string, next: string | null | undefined, isAdminEntry?: boolean) {
  const base = origin.replace(/\/$/, '')
  const url = new URL(base)
  const isAdminOrigin = isAdminEntry !== undefined ? isAdminEntry : isAdminSubdomain(url.host)
  const target = normalizeNextPath(next, isAdminOrigin ? ADMIN_POST_LOGIN_PATH : DEFAULT_POST_LOGIN_PATH)
  return `${base}/auth/callback?next=${encodeURIComponent(target)}&adminEntry=${isAdminOrigin}`
}
