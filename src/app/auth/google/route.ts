import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { buildOAuthCallbackUrl, normalizeNextPath } from '@/lib/auth-routing'
import { SITE_URL } from '@/lib/site-config'

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = normalizeNextPath(searchParams.get('next'))
  const adminEntry = searchParams.get('adminEntry') === 'true'
  const callbackUrl = buildOAuthCallbackUrl(origin || SITE_URL, next, adminEntry)
  const isProduction = process.env.VERCEL_ENV === 'production' && !isLocalDevelopmentOrigin(origin)
  const appOrigin = (isProduction ? SITE_URL : origin).replace(/\/$/, '')

  const cookieStore = await cookies()
  const redirectResponse = NextResponse.redirect(origin || SITE_URL)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
            redirectResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent select_account',
      },
    },
  })

  if (error || !data.url) {
    console.error('[auth/google] signInWithOAuth failed', error)
    return NextResponse.redirect(
      `${appOrigin}/sign-in?error=oauth_callback_failed&next=${encodeURIComponent(next)}`
    )
  }

  redirectResponse.headers.set('Location', data.url)
  return redirectResponse
}
