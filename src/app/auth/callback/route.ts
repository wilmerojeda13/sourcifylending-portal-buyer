import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

async function sendNewSignupNotification(email: string, fullName: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
        to: ['abel@sourcifylending.com'],
        subject: `New Sign-Up: ${fullName || email}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:18px;font-weight:700;margin:0">New Portal Sign-Up</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:100px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600">${fullName || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:14px;font-weight:600">${email}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Time</td><td style="padding:8px 0;font-size:14px">${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</td></tr>
            </table>
            <p style="margin-top:20px;font-size:13px;color:#6b7280">Log in to the admin panel to view and assign a program.</p>
          </div>
        </div>`,
      }),
    })
  } catch { /* fire-and-forget */ }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Ensure a profile row exists for OAuth users (Google sign-in creates no profile automatically)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (!existing) {
          const fullName = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split('@')[0]
            || ''

          await supabase.from('profiles').insert({
            id: user.id,
            email: user.email ?? '',
            full_name: fullName,
            subscription_status: 'inactive',
            account_state: 'prospect',
            progress_percentage: 0,
            nsf_flag: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          // Fire-and-forget: activity log + admin signup notification
          supabase.from('activity_logs').insert({
            user_id: user.id,
            event_type: 'signup',
            event_data: { email: user.email, source: 'google_oauth' },
            created_at: new Date().toISOString(),
          }).then(() => {})
          sendNewSignupNotification(user.email ?? '', fullName)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If something went wrong, send to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
