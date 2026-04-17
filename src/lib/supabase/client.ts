import { createBrowserClient } from '@supabase/ssr'

const PERSISTENT_SESSION_MAX_AGE = 400 * 24 * 60 * 60
const SHORT_SESSION_MAX_AGE = 7 * 24 * 60 * 60

interface BrowserClientOptions {
  keepSignedIn?: boolean
}

export function createClient(options: BrowserClientOptions = {}) {
  const keepSignedIn = options.keepSignedIn ?? true
  const clientOptions =
    Object.keys(options).length > 0
      ? {
          isSingleton: false,
          cookieOptions: {
            maxAge: keepSignedIn ? PERSISTENT_SESSION_MAX_AGE : SHORT_SESSION_MAX_AGE,
          },
        }
      : undefined

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    clientOptions
  )
}
