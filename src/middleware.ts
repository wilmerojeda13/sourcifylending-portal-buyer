import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  await supabase.auth.getUser()

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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
