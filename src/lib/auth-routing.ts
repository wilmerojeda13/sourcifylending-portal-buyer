import { ADMIN_URL, SITE_URL } from '@/lib/site-config'

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

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

export function buildOAuthCallbackUrl(origin: string, next: string | null | undefined, isAdminEntry?: boolean) {
  const isProduction = process.env.VERCEL_ENV === 'production' && !isLocalDevelopmentOrigin(origin)
  const fallbackBase = isAdminEntry ? ADMIN_URL : SITE_URL
  const base = (isProduction ? fallbackBase : origin).replace(/\/$/, '')
  const url = new URL(base)
  const isAdminOrigin = isAdminEntry !== undefined ? isAdminEntry : isAdminSubdomain(url.host)
  const target = normalizeNextPath(next, isAdminOrigin ? ADMIN_POST_LOGIN_PATH : DEFAULT_POST_LOGIN_PATH)
  return `${base}/auth/callback?next=${encodeURIComponent(target)}&adminEntry=${isAdminOrigin}`
}
