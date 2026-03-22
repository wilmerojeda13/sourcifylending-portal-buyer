import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { logPortalEvent } from '@/lib/portal-events'

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
        // Affiliate referral attribution
        try {
          const refCode = cookieStore.get('affiliate_ref')?.value
          if (refCode && user.email) {
            const serviceClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { cookies: { getAll() { return [] }, setAll() {} } }
            )
            const { data: affiliate } = await serviceClient
              .from('affiliates')
              .select('id, email')
              .eq('referral_code', refCode.toUpperCase())
              .eq('status', 'active')
              .single()

            if (affiliate) {
              // ── Rule 1: Self-referral check ─────────────────────────────────
              const isSelfReferral =
                affiliate.email.toLowerCase() === user.email?.toLowerCase() ||
                (affiliate as { user_id?: string }).user_id === user.id

              // ── Rule 2: Retroactive attribution check ───────────────────────
              // If the client's auth account existed BEFORE the affiliate account
              // was created, this is a retroactive claim — block silently.
              const clientCreatedAt  = user.created_at ? new Date(user.created_at).getTime() : Date.now()
              const affiliateCreatedAt = affiliate.created_at ? new Date(affiliate.created_at).getTime() : 0
              const isRetroactive = clientCreatedAt < affiliateCreatedAt

              // ── Rule 3: Duplicate check ─────────────────────────────────────
              const { data: existingRef } = await serviceClient
                .from('affiliate_referrals')
                .select('id')
                .eq('affiliate_id', affiliate.id)
                .eq('lead_email', user.email)
                .maybeSingle()

              if (!existingRef && !isRetroactive) {
                await serviceClient.from('affiliate_referrals').insert({
                  affiliate_id: affiliate.id,
                  user_id: user.id,
                  lead_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                  lead_email: user.email,
                  referral_status: 'signed_up',
                  is_self_referral: isSelfReferral,
                  is_flagged: isSelfReferral,   // self-referrals are flagged and blocked from commission
                  flag_reason: isSelfReferral ? 'Self-referral detected at signup' : null,
                })
                if (isSelfReferral) {
                  await serviceClient.from('affiliate_flags').insert({
                    affiliate_id: affiliate.id,
                    flag_type: 'self_referral',
                    reason: `Affiliate ${affiliate.email} attempted to refer themselves`,
                    status: 'pending',
                  })
                }
              }
              // isRetroactive → silently ignore. No referral record created,
              // no commission will ever fire. Client retains no affiliation.
            }
          }
        } catch (e) { /* fire-and-forget — don't break auth */ }

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
          logPortalEvent({
            userId: user.id,
            eventType: 'account_created',
            category: 'accounts',
            severity: 'success',
            title: 'New account created',
            message: user.email,
            metadata: { source: 'google_oauth', full_name: fullName },
          })
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If something went wrong, send to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
