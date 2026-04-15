export const DEFAULT_POST_LOGIN_PATH = '/portal'

export function normalizeNextPath(next: string | null | undefined, fallback = DEFAULT_POST_LOGIN_PATH) {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  return next
}

export function buildOAuthCallbackUrl(origin: string, next: string | null | undefined) {
  const base = origin.replace(/\/$/, '')
  const target = normalizeNextPath(next)
  return `${base}/auth/callback?next=${encodeURIComponent(target)}`
}
