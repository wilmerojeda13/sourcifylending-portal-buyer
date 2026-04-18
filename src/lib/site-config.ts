const trimSlash = (value: string) => value.replace(/\/$/, '')

export const SITE_URL = trimSlash(
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://www.sourcifylending.com'
)

export const APP_URL = trimSlash(
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  SITE_URL
)

export const ANALYZER_URL = trimSlash(
  process.env.ANALYZER_URL ??
  `${APP_URL}/analyzer`
)

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
  process.env.SUPPORT_EMAIL ??
  'support@sourcifylending.com'

export const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL ??
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ??
  SUPPORT_EMAIL

export const NO_REPLY_EMAIL =
  process.env.NEXT_PUBLIC_NO_REPLY_EMAIL ??
  'no-reply@ai.sourcifylending.com'

export const SHOW_DEMO_TOOLS = process.env.NEXT_PUBLIC_SHOW_DEMO_TOOLS === 'true'
