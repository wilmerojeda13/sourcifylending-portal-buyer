import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeNextPath } from '@/lib/auth-routing'
import { logPortalEvent } from '@/lib/portal-events'
import { CRM_INVITE_COOKIE, linkCrmInviteAccount } from '@/lib/crm-invites'
import { CRM_TEXT_COOKIE, linkCrmSmsAccount } from '@/lib/crm-sms'
import { CRM_ANALYZER_SESSION_COOKIE, recordAnalyzerSessionEvent } from '@/lib/crm-analyzer-sessions'
import { parseContentAttributionCookie, recordContentEvent } from '@/lib/content-engine'
import { ensureSignupCrmLead } from '@/lib/signup-crm'
import { logSignupSecurityEvent } from '@/lib/signup-security'
import { getSignupAutomationErrorMessage, recordSignupAutomationFailure } from '@/lib/signup-automation-monitor'
import { ADMIN_NOTIFICATION_EMAIL, NO_REPLY_EMAIL } from '@/lib/site-config'

async function sendNewSignupNotification(email: string, fullName: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `SourcifyLending Portal <${NO_REPLY_EMAIL}>`,
        to: [ADMIN_NOTIFICATION_EMAIL],
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
  } catch {
    // fire-and-forget
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = normalizeNextPath(searchParams.get('next'))
  const appOrigin = origin.replace(/\/$/, '')

  if (!code) {
    return NextResponse.redirect(`${appOrigin}/sign-in?error=oauth_callback_failed&next=${encodeURIComponent(next)}`)
  }

  const cookieStore = await cookies()
  const redirectResponse = NextResponse.redirect(`${appOrigin}${next}`)
  const serviceClient = await createServiceClient()

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed', error)
    return NextResponse.redirect(`${appOrigin}/sign-in?error=oauth_callback_failed&next=${encodeURIComponent(next)}`)
  }

  const user = data.user ?? data.session?.user
  if (!user) {
    console.error('[auth/callback] exchangeCodeForSession returned no user', data)
    return NextResponse.redirect(`${appOrigin}/sign-in?error=oauth_callback_failed&next=${encodeURIComponent(next)}`)
  }

  const { data: existingById } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!existingById && user.email) {
    const { data: emailProfile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', user.email)
      .neq('id', user.id)
      .maybeSingle()

    if (emailProfile) {
      await supabase.auth.signOut()
      return NextResponse.redirect(
        `${appOrigin}/sign-in?error=account_exists&email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(next)}`
      )
    }
  }

  if (!existingById) {
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || ''
    const { error: profileErr } = await serviceClient.from('profiles').insert({
      id: user.id,
      email: user.email ?? '',
      full_name: fullName,
      feature_tier: 'free',
      billing_status: 'inactive',
      member_status: 'prospect',
      acquisition_path: 'self_serve',
      progress_percentage: 0,
      nsf_flag: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (profileErr && profileErr.code !== '23505') {
      console.error('[auth/callback] profile bootstrap failed', profileErr)
      return NextResponse.redirect(`${appOrigin}/sign-in?error=oauth_callback_failed&next=${encodeURIComponent(next)}`)
    }
  }

  const crmInviteId = cookieStore.get(CRM_INVITE_COOKIE)?.value
  const analyzerSessionId = cookieStore.get(CRM_ANALYZER_SESSION_COOKIE)?.value
  if (crmInviteId) {
    cookieStore.delete(CRM_INVITE_COOKIE)
    redirectResponse.cookies.delete(CRM_INVITE_COOKIE)
  }
  if (analyzerSessionId) {
    cookieStore.delete(CRM_ANALYZER_SESSION_COOKIE)
    redirectResponse.cookies.delete(CRM_ANALYZER_SESSION_COOKIE)
  }

  const refCode = cookieStore.get('affiliate_ref')?.value
  const leadId = cookieStore.get('affiliate_lead')?.value
  const crmTextId = cookieStore.get(CRM_TEXT_COOKIE)?.value
  const contentAttribution = parseContentAttributionCookie(cookieStore.get('sl_content_attribution')?.value)
  const isNewProfile = !existingById
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || ''
  const confirmedAgeMs = user.confirmed_at ? Date.now() - new Date(user.confirmed_at).getTime() : Infinity
  const isFreshConfirmation = confirmedAgeMs < 5 * 60 * 1000
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null
  const userAgent = request.headers.get('user-agent')

  ;(async () => {
    try {
      const svc = serviceClient

      if (refCode && user.email) {
        try {
          const { data: affiliate } = await svc
            .from('affiliates')
            .select('id, user_id, name, email, created_at')
            .eq('referral_code', refCode.toUpperCase())
            .eq('status', 'active')
            .single()

          if (affiliate) {
            const now = new Date().toISOString()
            const isSelfReferral =
              affiliate.email.toLowerCase() === user.email?.toLowerCase() ||
              (affiliate as { user_id?: string }).user_id === user.id
            const clientCreatedAt = user.created_at ? new Date(user.created_at).getTime() : Date.now()
            const affiliateCreatedAt = affiliate.created_at ? new Date(affiliate.created_at).getTime() : 0
            const isRetroactive = clientCreatedAt < affiliateCreatedAt
            let leadDealType = 'partner_assisted'
            let leadRecordId: string | null = null

            if (leadId) {
              const { data: leadRecord } = await svc
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

            const { data: existingRef } = await svc
              .from('affiliate_referrals')
              .select('id')
              .eq('affiliate_id', affiliate.id)
              .eq('lead_email', user.email)
              .maybeSingle()

            let referralId: string | null = existingRef?.id ?? null
            if (!existingRef && !isRetroactive) {
              const { data: newReferral } = await svc.from('affiliate_referrals').insert({
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

              referralId = newReferral?.id ?? referralId
              if (leadRecordId) {
                await svc.from('affiliate_leads').update({
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
                await svc.from('affiliate_flags').insert({
                  affiliate_id: affiliate.id,
                  flag_type: 'self_referral',
                  reason: `Affiliate ${affiliate.email} attempted to refer themselves`,
                  status: 'pending',
                })
              }
            }

            const leadPayload = {
              affiliate_id: affiliate.id,
              user_id: user.id,
              referral_id: referralId,
              full_name: fullName,
              email: user.email,
              phone: user.user_metadata?.phone ?? null,
              business_name: user.user_metadata?.business_name ?? null,
              deal_type: leadDealType,
              acquisition_path: 'partner_assisted',
              onboarding_status: 'partner_closing',
              partner_relationship_started_at: now,
              account_created_at: now,
              converted_at: now,
              status: 'account_created',
              updated_at: now,
            }

            try {
              const { data: existingLead } = await svc
                .from('affiliate_leads')
                .select('id')
                .eq('affiliate_id', affiliate.id)
                .eq('email', user.email)
                .maybeSingle()

              if (existingLead?.id) {
                await svc.from('affiliate_leads').update(leadPayload).eq('id', existingLead.id)
              } else {
                await svc.from('affiliate_leads').insert(leadPayload)
              }
            } catch {
              // keep auth flow resilient
            }
          }
        } catch {
          // never break auth
        }
      }

      if (refCode) {
        try {
          const { data: aff } = await svc
            .from('affiliates')
            .select('id, name')
            .eq('referral_code', refCode.toUpperCase())
            .eq('status', 'active')
            .maybeSingle()

          if (aff) {
            const upd = await svc.from('profiles').update({
              acquisition_path: 'partner_assisted',
              assigned_partner_affiliate_id: aff.id,
              assigned_partner_name: aff.name,
              partner_relationship_started_at: new Date().toISOString(),
              partner_onboarding_status: 'partner_closing',
              updated_at: new Date().toISOString(),
            }).eq('id', user.id)

            if (upd.error) {
              await svc.from('profiles').update({
                acquisition_path: 'partner_assisted',
                updated_at: new Date().toISOString(),
              }).eq('id', user.id)
            }
          }
        } catch {
          // never break auth
        }
      }

      if (crmTextId) {
        await linkCrmSmsAccount(svc, {
          smsId: crmTextId,
          userId: user.id,
          profileId: user.id,
          email: user.email,
          createdBy: 'oauth_callback',
          metadata: { source: 'oauth_signup' },
        }).catch(() => {})
      }

      if (crmInviteId && user.email) {
        try {
          await linkCrmInviteAccount(svc, {
            inviteId: crmInviteId,
            userId: user.id,
            profileId: user.id,
            email: user.email,
            createdBy: 'auth_callback',
            metadata: { source: 'auth_callback' },
          })
        } catch {
          // never break auth
        }
      }

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
          const existingProfile = await svc
            .from('profiles')
            .select('business_name, suspicious_signup, signup_risk_score, suspicious_signup_reason')
            .eq('id', user.id)
            .maybeSingle()

          const crmResult = await ensureSignupCrmLead({
            supabase: svc,
            userId: user.id,
            fullName,
            email: user.email ?? '',
            businessName: existingProfile.data?.business_name ?? user.user_metadata?.business_name ?? null,
            source: source === 'google_oauth' ? 'google_oauth' : 'email_password',
            suspicious: Boolean(existingProfile.data?.suspicious_signup),
            riskScore: existingProfile.data?.signup_risk_score ?? null,
            reasons: existingProfile.data?.suspicious_signup_reason ? [existingProfile.data.suspicious_signup_reason] : [],
          })

          if (analyzerSessionId) {
            await recordAnalyzerSessionEvent({
              supabase: svc,
              sessionId: analyzerSessionId,
              eventType: 'account_created',
              metadata: { user_id: user.id, email: user.email ?? '', lead_id: crmResult.leadId },
            }).catch(() => {})
          }

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
              merged_with_analyzer: crmResult.mergedWithAnalyzer ?? false,
              duplicate_review_required: crmResult.duplicateRisk ?? false,
              notification_sent: crmResult.notificationSent ?? false,
            },
          })
        } catch (crmErr) {
          console.error('[auth/callback] signup crm lead creation failed', crmErr)
          await recordSignupAutomationFailure({
            userId: user.id,
            email: user.email ?? '',
            stage: 'oauth_crm_lead_create',
            source: isNewProfile ? 'google_oauth' : 'email_password',
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
              source: isNewProfile ? 'google_oauth' : 'email_password',
              error: getSignupAutomationErrorMessage(crmErr),
            },
            sendEmail: true,
          })
        }

        logSignupSecurityEvent({
          email: user.email ?? '',
          eventType: 'confirmed',
          meta: { ipAddress, userAgent, origin: null, referer: null },
          metadata: { source },
        }).catch(() => {})

        import('@/modules/agents/onboarding-agent').then(({ runOnboardingAgent }) => {
          runOnboardingAgent(user.id).catch(err => console.error('[OnboardingAgent trigger]', err))
        })

        if (contentAttribution?.pageId) {
          await recordContentEvent({
            pageId: contentAttribution.pageId,
            eventType: 'signup',
            relatedRecordId: user.id,
            metadata: { source, email: user.email },
          })
        }
      }
    } catch {
      // top-level safety net
    }
  })().catch(() => {})

  return redirectResponse
}
