import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SITE_URL } from '@/lib/site-config'

const SITE_HOST = new URL(SITE_URL).host.toLowerCase()
// Only redirect the bare apex domain → www when SITE_HOST itself starts with www.
// If SITE_HOST is a non-www subdomain (e.g. app.*), APEX_HOST would equal SITE_HOST
// and every request would redirect to itself — an infinite loop. Skip the redirect in that case.
const APEX_HOST = SITE_HOST.startsWith('www.') ? SITE_HOST.slice(4) : null
const APEX_HOST_WITH_PORT = APEX_HOST ? `${APEX_HOST}:443` : null

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? ''
  if (APEX_HOST && (host === APEX_HOST || host === APEX_HOST_WITH_PORT)) {
    const url = request.nextUrl.clone()
    url.host = SITE_HOST
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  let supabaseResponse = NextResponse.next({ request })

  // Refresh Supabase session on every request so cookies stay valid
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Race against a 1 s timeout — Vercel edge middleware limit is ~1.5 s.
  // If Supabase auth is slow the session simply won't refresh this request,
  // but the site stays up instead of returning MIDDLEWARE_INVOCATION_TIMEOUT.
  await Promise.race([
    supabase.auth.getUser().catch(() => null),
    new Promise(resolve => setTimeout(resolve, 1000)),
  ])

  // Capture affiliate referral code from ?ref= query param
  const url = new URL(request.url)
  const refCode = url.searchParams.get('ref')
  if (refCode && refCode.length >= 6 && refCode.length <= 12) {
    const existing = request.cookies.get('affiliate_ref')
    if (!existing) {
      // Set cookie for 30 days
      supabaseResponse.cookies.set('affiliate_ref', refCode.toUpperCase(), {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      })
    }
    // Fire-and-forget click tracking (don't await, don't block)
    const origin = request.nextUrl.origin
    fetch(`${origin}/api/affiliate/track-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referralCode: refCode.toUpperCase(),
        landingPage: url.pathname,
      }),
    }).catch(() => {})
  }

  // Capture affiliate lead ID from ?lead= query param (set alongside ref)
  const leadId = url.searchParams.get('lead')
  if (leadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
    const existingLead = request.cookies.get('affiliate_lead')
    if (!existingLead) {
      supabaseResponse.cookies.set('affiliate_lead', leadId, {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // IMPORTANT: exclude webhook/TwiML endpoints from auth/session middleware.
    // Twilio must receive raw 200 text/xml without redirects or cookie mutations.
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
