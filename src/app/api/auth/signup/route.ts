import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logPortalEvent } from '@/lib/portal-events'
import { ensureSignupCrmLead } from '@/lib/signup-crm'
import { linkCrmSmsAccount } from '@/lib/crm-sms'
import { CRM_ANALYZER_SESSION_COOKIE, recordAnalyzerSessionEvent } from '@/lib/crm-analyzer-sessions'
import { parseContentAttributionCookie, recordContentEvent } from '@/lib/content-engine'
import { recordConsentRecord } from '@/lib/public-form-audit'
import {
  buildComplianceSnapshot,
  validateCompliancePayload,
  type CompliancePayload,
} from '@/lib/public-form-compliance'
import {
  assessSignup,
  buildSignupSource,
  enforceSignupRateLimit,
  getSignupRequestMeta,
  logSignupSecurityEvent,
  verifyTurnstileToken,
} from '@/lib/signup-security'
import { getSignupAutomationErrorMessage, recordSignupAutomationFailure } from '@/lib/signup-automation-monitor'

function isMissingSignupSecurityProfileColumns(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === '42703' || error?.message?.includes('suspicious_signup') || error?.message?.includes('signup_risk_score') || false
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      full_name?: string
      email?: string
      password?: string
      business_name?: string
      website?: string
      turnstileToken?: string | null
      crm_invite_id?: string | null
      crm_text_id?: string | null
      crm_analyzer_session_id?: string | null
      compliance?: CompliancePayload
    }

    const fullName = body.full_name ?? ''
    const email = body.email ?? ''
    const businessName = body.business_name ?? ''
    const password = body.password ?? ''
    const analyzerSessionId = body.crm_analyzer_session_id ?? req.cookies.get(CRM_ANALYZER_SESSION_COOKIE)?.value ?? null
    const meta = getSignupRequestMeta(req)
    const complianceValidation = validateCompliancePayload(body.compliance, 'public_signup')

    if (!complianceValidation.ok) {
      return NextResponse.json({ error: complianceValidation.error }, { status: 400 })
    }

    const complianceSnapshot = buildComplianceSnapshot(req, body.compliance!)
    const contentAttribution = parseContentAttributionCookie(req.cookies.get('sl_content_attribution')?.value)

    if (body.website) {
      await logSignupSecurityEvent({
        email,
        eventType: 'blocked_validation',
        meta,
        metadata: { reason: 'honeypot_triggered' },
      })
      return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 400 })
    }

    if (password.length < 8) {
      await logSignupSecurityEvent({
        email,
        eventType: 'blocked_validation',
        meta,
        metadata: { reason: 'password_too_short' },
      })
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const assessment = assessSignup({ email, fullName, businessName })
    await logSignupSecurityEvent({
      email: assessment.normalizedEmail,
      eventType: 'attempt',
      meta,
      riskScore: assessment.riskScore,
      reasons: assessment.reasons,
      metadata: { source: buildSignupSource(meta) },
    })

    if (assessment.isBlocked) {
      await logSignupSecurityEvent({
        email: assessment.normalizedEmail,
        eventType: assessment.isDisposableDomain ? 'blocked_disposable' : 'blocked_validation',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
      })
      return NextResponse.json({ error: 'Unable to create account right now. Please use a valid business identity and email.' }, { status: 400 })
    }

    const rateLimit = await enforceSignupRateLimit({
      email: assessment.normalizedEmail,
      ipAddress: meta.ipAddress,
    })

    if (rateLimit.blocked) {
      await logSignupSecurityEvent({
        email: assessment.normalizedEmail,
        eventType: 'blocked_rate_limit',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        metadata: {
          ip_count_last_hour: rateLimit.ipCount,
          email_count_last_hour: rateLimit.emailCount,
        },
      })
      return NextResponse.json({ error: 'Too many signup attempts. Please wait and try again.' }, { status: 429 })
    }

    const captchaOk = await verifyTurnstileToken(body.turnstileToken ?? null)
    if (!captchaOk) {
      await logSignupSecurityEvent({
        email: assessment.normalizedEmail,
        eventType: 'blocked_captcha',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
      })
      return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data, error } = await supabase.auth.signUp({
      email: assessment.normalizedEmail,
      password,
      options: {
        data: {
          full_name: assessment.normalizedFullName,
          business_name: assessment.normalizedBusinessName,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/auth/callback?next=/dashboard`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
    }

    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const now = new Date().toISOString()
    const suspicious = assessment.shouldQuarantine
    let { error: profileError } = await serviceSupabase.from('profiles').upsert({
      id: data.user.id,
      full_name: assessment.normalizedFullName,
      email: assessment.normalizedEmail,
      business_name: assessment.normalizedBusinessName,
      subscription_status: 'inactive',
      account_state: 'prospect',
      progress_percentage: 0,
      nsf_flag: false,
      portal_blocked: suspicious,
      suspicious_signup: suspicious,
      suspicious_signup_reason: suspicious ? assessment.reasons.join(', ') : null,
      signup_risk_score: assessment.riskScore,
      signup_source: 'email_password',
      signup_last_ip: meta.ipAddress,
      signup_last_user_agent: meta.userAgent,
      updated_at: now,
    })

    if (isMissingSignupSecurityProfileColumns(profileError)) {
      ;({ error: profileError } = await serviceSupabase.from('profiles').upsert({
        id: data.user.id,
        full_name: assessment.normalizedFullName,
        email: assessment.normalizedEmail,
        business_name: assessment.normalizedBusinessName,
        subscription_status: 'inactive',
        account_state: 'prospect',
        progress_percentage: 0,
        nsf_flag: false,
        portal_blocked: suspicious,
        updated_at: now,
      }))
    }

    if (profileError) {
      console.error('[auth/signup] profile upsert failed', profileError)
      await recordSignupAutomationFailure({
        userId: data.user.id,
        email: assessment.normalizedEmail,
        stage: 'profile_upsert',
        source: 'email_password',
        errorMessage: profileError.message,
      })
      await logPortalEvent({
        userId: data.user.id,
        eventType: 'signup_profile_failed',
        category: 'accounts',
        severity: 'critical',
        title: 'Signup profile creation failed',
        message: assessment.normalizedEmail,
        metadata: {
          source: 'email_password',
          error: profileError.message,
        },
        sendEmail: true,
      })
      return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
    }

    await logSignupSecurityEvent({
      email: assessment.normalizedEmail,
      eventType: suspicious ? 'suspicious_created' : 'created',
      meta,
      riskScore: assessment.riskScore,
      reasons: assessment.reasons,
      metadata: {
        user_id: data.user.id,
        suspicious,
        crm_invite_id: body.crm_invite_id ?? null,
        crm_text_id: body.crm_text_id ?? null,
      },
    })

    if (body.crm_text_id) {
      await linkCrmSmsAccount(serviceSupabase, {
        smsId: body.crm_text_id,
        userId: data.user.id,
        profileId: data.user.id,
        email: assessment.normalizedEmail,
        createdBy: 'signup',
        metadata: { source: 'email_password_signup' },
      }).catch((error) => {
        console.error('[auth/signup] crm sms account link failed', error)
      })
    }

    await logPortalEvent({
      userId: data.user.id,
      eventType: 'signup_requested',
      category: 'accounts',
      severity: suspicious ? 'warning' : 'success',
      title: suspicious ? 'Suspicious signup quarantined' : 'New signup requested',
      message: assessment.normalizedEmail,
      metadata: {
        full_name: assessment.normalizedFullName,
        business_name: assessment.normalizedBusinessName,
        source: 'email_password',
        suspicious,
        signup_risk_score: assessment.riskScore,
        signup_reasons: assessment.reasons.join(', ') || null,
        page_url: complianceSnapshot.page_url,
        consent_text_version: complianceSnapshot.consent_text_version,
      },
      sendEmail: true,
    })

    if (contentAttribution?.pageId) {
      await recordContentEvent({
        pageId: contentAttribution.pageId,
        eventType: 'signup',
        relatedRecordId: data.user.id,
        metadata: {
          source: 'email_password_signup',
          email: assessment.normalizedEmail,
          business_name: assessment.normalizedBusinessName,
        },
      })
    }

    await recordConsentRecord({
      formName: 'public_signup',
      snapshot: complianceSnapshot,
      email: assessment.normalizedEmail,
      fullName: assessment.normalizedFullName,
      businessName: assessment.normalizedBusinessName,
      userId: data.user.id,
      profileId: data.user.id,
      metadata: {
        source: 'email_password_signup',
        crm_invite_id: body.crm_invite_id ?? null,
        crm_text_id: body.crm_text_id ?? null,
      },
    })

    try {
      const crmResult = await ensureSignupCrmLead({
        supabase: serviceSupabase,
        userId: data.user.id,
        fullName: assessment.normalizedFullName,
        email: assessment.normalizedEmail,
        businessName: assessment.normalizedBusinessName,
        source: 'email_password',
        suspicious,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        complianceSnapshot,
      })

      if (analyzerSessionId) {
        await recordAnalyzerSessionEvent({
          supabase: serviceSupabase,
          sessionId: analyzerSessionId,
          eventType: 'account_created',
          metadata: {
            user_id: data.user.id,
            email: assessment.normalizedEmail,
            lead_id: crmResult.leadId,
          },
        }).catch(() => {})
      }

      await logPortalEvent({
        userId: data.user.id,
        eventType: 'signup_crm_lead_created',
        category: 'leads',
        severity: suspicious ? 'warning' : 'success',
        title: suspicious ? 'Suspicious signup CRM lead quarantined' : 'Signup CRM lead created',
        message: assessment.normalizedEmail,
        metadata: {
          lead_id: crmResult.leadId,
          action: crmResult.action,
          source: 'email_password',
          suspicious,
          merged_with_analyzer: crmResult.mergedWithAnalyzer ?? false,
          duplicate_review_required: crmResult.duplicateRisk ?? false,
          notification_sent: crmResult.notificationSent ?? false,
        },
      })
    } catch (crmError) {
      console.error('[auth/signup] crm lead creation failed', crmError)
      await recordSignupAutomationFailure({
        userId: data.user.id,
        email: assessment.normalizedEmail,
        stage: 'crm_lead_create',
        source: 'email_password',
        errorMessage: getSignupAutomationErrorMessage(crmError),
      })
      await logPortalEvent({
        userId: data.user.id,
        eventType: 'signup_crm_failed',
        category: 'leads',
        severity: 'critical',
        title: 'Signup created without CRM lead',
        message: assessment.normalizedEmail,
        metadata: {
          source: 'email_password',
          error: getSignupAutomationErrorMessage(crmError),
        },
        sendEmail: true,
      })
    }

    return NextResponse.json({
      success: true,
      user_id: data.user.id,
      suspicious,
    })
  } catch (error) {
    console.error('[auth/signup] unexpected error', error)
    return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
  }
}
