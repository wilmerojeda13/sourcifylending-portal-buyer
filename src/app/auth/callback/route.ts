import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { logPortalEvent } from '@/lib/portal-events'
import { CRM_INVITE_COOKIE, linkCrmInviteAccount } from '@/lib/crm-invites'
import { CRM_TEXT_COOKIE, linkCrmSmsAccount } from '@/lib/crm-sms'
import { parseContentAttributionCookie, recordContentEvent } from '@/lib/content-engine'
import { ensureSignupCrmLead } from '@/lib/signup-crm'
import { logSignupSecurityEvent } from '@/lib/signup-security'
import { getSignupAutomationErrorMessage, recordSignupAutomationFailure } from '@/lib/signup-automation-monitor'

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
  const nextParam = searchParams.get('next') ?? '/dashboard'
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '')
  const next = nextParam.startsWith('/') && !nextParam.startsWith('/login') && !nextParam.startsWith('/signin')
    ? nextParam
    : '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const redirectResponse = NextResponse.redirect(`${appOrigin}${next}`)
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.auth.getUser()

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
              .select('id, user_id, name, email, created_at')
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

              // ── Get lead data for deal_type (if user came from an invite link) ──
              const leadId = cookieStore.get('affiliate_lead')?.value
              let leadDealType: string = 'partner_assisted'
              let leadRecordId: string | null = null
              if (leadId) {
                const { data: leadRecord } = await serviceClient
                  .from('affiliate_leads')
                  .select('id, deal_type, email')
                  .eq('id', leadId)
                  .eq('affiliate_id', affiliate.id)
                  .maybeSingle()
                if (leadRecord) {
                  leadRecordId = leadRecord.id
                  leadDealType = leadRecord.deal_type || 'partner_assisted'
                }
              }

              // ── Rule 3: Duplicate check ─────────────────────────────────────
              const { data: existingRef } = await serviceClient
                .from('affiliate_referrals')
                .select('id')
                .eq('affiliate_id', affiliate.id)
                .eq('lead_email', user.email)
                .maybeSingle()

              if (!existingRef && !isRetroactive) {
                const { data: newReferral } = await serviceClient.from('affiliate_referrals').insert({
                  affiliate_id: affiliate.id,
                  user_id: user.id,
                  lead_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                  lead_email: user.email,
                  referral_status: 'signed_up',
                  is_self_referral: isSelfReferral,
                  is_flagged: isSelfReferral,
                  flag_reason: isSelfReferral ? 'Self-referral detected at signup' : null,
                  deal_type: leadDealType,
                  acquisition_path: 'partner_assisted',
                  partner_relationship_started_at: new Date().toISOString(),
                  onboarding_status: 'partner_closing',
                }).select('id').single()

                // ── Update affiliate_lead status to account_created ──────────
                if (leadRecordId) {
                  await serviceClient.from('affiliate_leads').update({
                    user_id: user.id,
                    referral_id: newReferral?.id ?? null,
                    status: 'account_created',
                    account_created_at: new Date().toISOString(),
                    acquisition_path: 'partner_assisted',
                    onboarding_status: 'partner_closing',
                    partner_relationship_started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }).eq('id', leadRecordId)
                }

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

        const fullName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || ''
        const crmTextId = cookieStore.get(CRM_TEXT_COOKIE)?.value
        const contentAttribution = parseContentAttributionCookie(cookieStore.get('sl_content_attribution')?.value)

        if (!existing) {
          // Check if a profile with this email already exists under a different auth user
          // (admin-created accounts land here when client tries Google OAuth)
          if (user.email) {
            const serviceClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { cookies: { getAll() { return [] }, setAll() {} } }
            )
            const { data: emailProfile } = await serviceClient
              .from('profiles')
              .select('id, invite_status')
              .eq('email', user.email)
              .neq('id', user.id)
              .maybeSingle()

            if (emailProfile) {
              // Email already has a portal account — sign out the new OAuth user
              // and redirect them to login with a clear message
              await supabase.auth.signOut()
              return NextResponse.redirect(
                `${appOrigin}/login?error=account_exists&email=${encodeURIComponent(user.email)}`
              )
            }
          }

          // Truly new user — create profile
          const { error: oauthProfileError } = await supabase.from('profiles').insert({
            id: user.id,
            email: user.email ?? '',
            full_name: fullName,
            subscription_status: 'inactive',
            account_state: 'prospect',
            acquisition_path: cookieStore.get('affiliate_ref')?.value ? 'partner_assisted' : 'self_serve',
            progress_percentage: 0,
            nsf_flag: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          if (oauthProfileError) {
            await recordSignupAutomationFailure({
              userId: user.id,
              email: user.email ?? '',
              stage: 'oauth_profile_upsert',
              source: 'google_oauth',
              errorMessage: oauthProfileError.message,
            })
          }

          supabase.from('activity_logs').insert({
            user_id: user.id,
            event_type: 'signup',
            event_data: { email: user.email, source: 'google_oauth' },
            created_at: new Date().toISOString(),
          }).then(() => {})
        }

        // Enrich profile with partner attribution if this signup came through a partner
        try {
          const refCode = cookieStore.get('affiliate_ref')?.value
          if (refCode) {
            const serviceClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { cookies: { getAll() { return [] }, setAll() {} } }
            )
            const { data: affiliate } = await serviceClient
              .from('affiliates')
              .select('id, name')
              .eq('referral_code', refCode.toUpperCase())
              .eq('status', 'active')
              .maybeSingle()

            if (affiliate) {
              const partnerProfileUpdate = {
                acquisition_path: 'partner_assisted',
                assigned_partner_affiliate_id: affiliate.id,
                assigned_partner_name: affiliate.name,
                partner_relationship_started_at: new Date().toISOString(),
                partner_onboarding_status: 'partner_closing',
                updated_at: new Date().toISOString(),
              }

              const partnerUpdate = await serviceClient
                .from('profiles')
                .update(partnerProfileUpdate)
                .eq('id', user.id)

              if (partnerUpdate.error) {
                await serviceClient
                  .from('profiles')
                  .update({ acquisition_path: 'partner_assisted', updated_at: new Date().toISOString() })
                  .eq('id', user.id)
              }
            }
          }
        } catch {
          // Never break login over partner attribution
        }

        if (crmTextId) {
          await linkCrmSmsAccount(supabase, {
            smsId: crmTextId,
            userId: user.id,
            profileId: user.id,
            email: user.email,
            createdBy: 'oauth_callback',
            metadata: { source: 'oauth_signup' },
          }).catch((error) => {
            console.error('[auth/callback] crm sms account link failed', error)
          })
        }

        // Send admin notification for new accounts.
        // Triggers when:
        //   - Profile didn't exist before (truly new user, any auth method)
        //   - OR email was just confirmed within the last 5 min (email/password flow
        //     where profile may have been pre-created by admin invite)
        const isNewProfile = !existing
        const confirmedAgeMs = user.confirmed_at
          ? Date.now() - new Date(user.confirmed_at).getTime()
          : Infinity
        const isFreshConfirmation = confirmedAgeMs < 5 * 60 * 1000 // confirmed in last 5 min

        if (isNewProfile || isFreshConfirmation) {
          const source = isNewProfile ? 'google_oauth' : 'email_password'
          sendNewSignupNotification(user.email ?? '', fullName)
          logPortalEvent({
            userId: user.id,
            eventType: 'account_created',
            category: 'accounts',
            severity: 'success',
            title: 'New account created',
            message: user.email,
            metadata: { source, full_name: fullName },
          })
          try {
            const serviceClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { cookies: { getAll() { return [] }, setAll() {} } }
            )
            const existingProfile = await serviceClient
              .from('profiles')
              .select('business_name, suspicious_signup, signup_risk_score, suspicious_signup_reason')
              .eq('id', user.id)
              .maybeSingle()

            const crmResult = await ensureSignupCrmLead({
              supabase: serviceClient,
              userId: user.id,
              fullName,
              email: user.email ?? '',
              businessName: existingProfile.data?.business_name ?? user.user_metadata?.business_name ?? null,
              source: source === 'google_oauth' ? 'google_oauth' : 'email_password',
              suspicious: Boolean(existingProfile.data?.suspicious_signup),
              riskScore: existingProfile.data?.signup_risk_score ?? null,
              reasons: existingProfile.data?.suspicious_signup_reason ? [existingProfile.data.suspicious_signup_reason] : [],
            })

            logPortalEvent({
              userId: user.id,
              eventType: 'signup_crm_lead_created',
              category: 'leads',
              severity: existingProfile.data?.suspicious_signup ? 'warning' : 'success',
              title: 'Signup CRM lead created',
              message: user.email ?? '',
              metadata: {
                lead_id: crmResult.leadId,
                action: crmResult.action,
                source,
              },
            })
          } catch (crmErr) {
            console.error('[auth/callback] signup crm lead creation failed', crmErr)
            await recordSignupAutomationFailure({
              userId: user.id,
              email: user.email ?? '',
              stage: 'oauth_crm_lead_create',
              source,
              errorMessage: getSignupAutomationErrorMessage(crmErr),
            })
            logPortalEvent({
              userId: user.id,
              eventType: 'signup_crm_failed',
              category: 'leads',
              severity: 'critical',
              title: 'Signup created without CRM lead',
              message: user.email ?? '',
              metadata: {
                source,
                error: getSignupAutomationErrorMessage(crmErr),
              },
              sendEmail: true,
            })
          }
          logSignupSecurityEvent({
            email: user.email ?? '',
            eventType: 'confirmed',
            meta: {
              ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null,
              userAgent: request.headers.get('user-agent'),
              origin: request.headers.get('origin'),
              referer: request.headers.get('referer'),
            },
            metadata: { source },
          }).catch(() => {})
          // Trigger Onboarding Agent for new signups (fire and forget)
          import('@/modules/agents/onboarding-agent').then(({ runOnboardingAgent }) => {
            runOnboardingAgent(user.id).catch(err => console.error('[OnboardingAgent trigger]', err))
          })

          if (contentAttribution?.pageId) {
            await recordContentEvent({
              pageId: contentAttribution.pageId,
              eventType: 'signup',
              relatedRecordId: user.id,
              metadata: {
                source,
                email: user.email,
              },
            })
          }
        }

        const crmInviteId = cookieStore.get(CRM_INVITE_COOKIE)?.value
        if (crmInviteId && user.email) {
          try {
            const serviceClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { cookies: { getAll() { return [] }, setAll() {} } }
            )
            await linkCrmInviteAccount(serviceClient, {
              inviteId: crmInviteId,
              userId: user.id,
              profileId: user.id,
              email: user.email,
              createdBy: 'auth_callback',
              metadata: { source: 'auth_callback' },
            })
          } catch {
            // Never break auth callback over invite attribution
          }
          cookieStore.delete(CRM_INVITE_COOKIE)
          redirectResponse.cookies.delete(CRM_INVITE_COOKIE)
        }
      }

      return redirectResponse
    }
  }

  // If something went wrong, send to login
  return NextResponse.redirect(`${appOrigin}/login?error=auth_callback_failed`)
}
