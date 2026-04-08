import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { linkCrmInviteAccount, markCrmInviteEvent } from '@/lib/crm-invites'
import { logPortalEvent } from '@/lib/portal-events'
import { recordConsentRecord } from '@/lib/public-form-audit'
import { ensureSignupCrmLead } from '@/lib/signup-crm'
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
import type { AnalyzerResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      email,
      password,
      full_name,
      business_name,
      lead_id,
      analyzer_result,
      crm_invite_id,
    }: {
      email: string
      password: string
      full_name: string
      business_name?: string
      lead_id?: string | null
      analyzer_result?: AnalyzerResult | null
      crm_invite_id?: string | null
      turnstileToken?: string | null
      compliance?: CompliancePayload
    } = body
    const meta = getSignupRequestMeta(req)
    const complianceValidation = validateCompliancePayload(body.compliance, 'public_analyzer_create_account')
    if (!complianceValidation.ok) {
      return NextResponse.json({ error: complianceValidation.error }, { status: 400 })
    }
    const complianceSnapshot = buildComplianceSnapshot(req, body.compliance!)

    if (!email || !password || !full_name) {
      await logSignupSecurityEvent({
        email: email ?? '',
        eventType: 'blocked_validation',
        meta,
        metadata: { reason: 'missing_required_fields', source: 'create_prospect' },
      })
      return NextResponse.json(
        { error: 'email, password, and full_name are required' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      await logSignupSecurityEvent({
        email,
        eventType: 'blocked_validation',
        meta,
        metadata: { reason: 'password_too_short', source: 'create_prospect' },
      })
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const assessment = assessSignup({
      email,
      fullName: full_name,
      businessName: business_name ?? '',
    })

    await logSignupSecurityEvent({
      email: assessment.normalizedEmail,
      eventType: 'attempt',
      meta,
      riskScore: assessment.riskScore,
      reasons: assessment.reasons,
      metadata: { source: 'create_prospect' },
    })

    if (assessment.isBlocked) {
      await logSignupSecurityEvent({
        email: assessment.normalizedEmail,
        eventType: assessment.isDisposableDomain ? 'blocked_disposable' : 'blocked_validation',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        metadata: { source: 'create_prospect' },
      })
      return NextResponse.json(
        { error: 'Unable to create account right now. Please use a valid business identity and email.' },
        { status: 400 },
      )
    }

    const supabase = await createServiceClient()
    const normalizedEmail = assessment.normalizedEmail
    const rateLimit = await enforceSignupRateLimit({
      email: normalizedEmail,
      ipAddress: meta.ipAddress,
    })

    if (rateLimit.blocked) {
      await logSignupSecurityEvent({
        email: normalizedEmail,
        eventType: 'blocked_rate_limit',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        metadata: {
          source: 'create_prospect',
          ip_count_last_hour: rateLimit.ipCount,
          email_count_last_hour: rateLimit.emailCount,
        },
      })
      return NextResponse.json({ error: 'Too many signup attempts. Please wait and try again.' }, { status: 429 })
    }

    const captchaOk = await verifyTurnstileToken(body.turnstileToken ?? null)
    if (!captchaOk) {
      await logSignupSecurityEvent({
        email: normalizedEmail,
        eventType: 'blocked_captcha',
        meta,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        metadata: { source: 'create_prospect' },
      })
      return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
    }

    let resolvedLeadId = lead_id ?? null
    if (!resolvedLeadId) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('source', 'free_analyzer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedLeadId = existingLead?.id ?? null
    }

    // Create auth user — auto-confirm so prospect can log in immediately
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: assessment.normalizedFullName,
        business_name: assessment.normalizedBusinessName || null,
      },
    })

    if (authError) {
      const msg = authError.message ?? ''
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already been registered') ||
        msg.toLowerCase().includes('user already exists')
      ) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = authData.user.id
    const now = new Date().toISOString()
    const suspicious = assessment.shouldQuarantine

    // Upsert profile — prospect state, copy analyzer snapshot
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: assessment.normalizedFullName,
      email: normalizedEmail,
      business_name: assessment.normalizedBusinessName || null,
      account_state: 'prospect',
      subscription_status: 'inactive',
      progress_percentage: 0,
      nsf_flag: false,
      lead_id: resolvedLeadId,
      assigned_program: analyzer_result?.assigned_program ?? null,
      readiness_status: analyzer_result?.readiness_status ?? null,
      latest_analyzer_result: analyzer_result ?? null,
      analyzed_at: now,
      portal_blocked: suspicious,
      suspicious_signup: suspicious,
      suspicious_signup_reason: suspicious ? assessment.reasons.join(', ') : null,
      signup_risk_score: assessment.riskScore,
      signup_source: 'create_prospect',
      signup_last_ip: meta.ipAddress,
      signup_last_user_agent: meta.userAgent,
      updated_at: now,
    })

    if (profileError) {
      await recordSignupAutomationFailure({
        userId,
        email: normalizedEmail,
        stage: 'profile_upsert',
        source: 'create_prospect',
        errorMessage: profileError.message,
      })
      return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
    }

    await recordConsentRecord({
      formName: 'public_analyzer_create_account',
      snapshot: complianceSnapshot,
      email: normalizedEmail,
      fullName: assessment.normalizedFullName,
      businessName: assessment.normalizedBusinessName || null,
      userId,
      profileId: userId,
      leadId: resolvedLeadId,
      metadata: {
        source: 'create_prospect',
        crm_invite_id: crm_invite_id ?? null,
      },
    })

    // Link lead → user (mark as converted)
    if (resolvedLeadId) {
      await supabase
        .from('leads')
        .update({ converted_to_user_id: userId })
        .eq('id', resolvedLeadId)
    } else {
      await supabase
        .from('leads')
        .update({ converted_to_user_id: userId })
        .eq('email', normalizedEmail)
        .eq('source', 'free_analyzer')
        .is('converted_to_user_id', null)
    }

    try {
      const crmLead = await ensureSignupCrmLead({
        supabase,
        userId,
        fullName: assessment.normalizedFullName,
        email: normalizedEmail,
        businessName: assessment.normalizedBusinessName || null,
        source: 'create_prospect',
        suspicious,
        riskScore: assessment.riskScore,
        reasons: assessment.reasons,
        complianceSnapshot,
        analyzerResult: analyzer_result ?? null,
      })

      await logPortalEvent({
        userId,
        eventType: 'signup_crm_lead_created',
        category: 'leads',
        severity: suspicious ? 'warning' : 'success',
        title: 'Prospect CRM lead created',
        message: normalizedEmail,
        metadata: {
          lead_id: crmLead.leadId,
          action: crmLead.action,
          source: 'create_prospect',
          merged_with_analyzer: crmLead.mergedWithAnalyzer ?? false,
          duplicate_review_required: crmLead.duplicateRisk ?? false,
          notification_sent: crmLead.notificationSent ?? false,
        },
      })
    } catch (crmErr) {
      console.error('CRM lead sync during create-prospect failed:', crmErr)
      await recordSignupAutomationFailure({
        userId,
        email: normalizedEmail,
        stage: 'crm_lead_create',
        source: 'create_prospect',
        errorMessage: getSignupAutomationErrorMessage(crmErr),
      })
      await logPortalEvent({
        userId,
        eventType: 'signup_crm_failed',
        category: 'leads',
        severity: 'critical',
        title: 'Prospect created without CRM lead',
        message: normalizedEmail,
        metadata: {
          source: 'create_prospect',
          error: getSignupAutomationErrorMessage(crmErr),
        },
        sendEmail: true,
      })
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      event_type: 'signup',
      event_data: {
        email: normalizedEmail,
        source: 'free_analyzer_prospect',
        account_state: 'prospect',
        program_recommended: analyzer_result?.assigned_program ?? null,
      },
      created_at: now,
    })

    await logSignupSecurityEvent({
      email: normalizedEmail,
      eventType: suspicious ? 'suspicious_created' : 'created',
      meta,
      riskScore: assessment.riskScore,
      reasons: assessment.reasons,
      metadata: {
        user_id: userId,
        source: 'create_prospect',
        crm_invite_id: crm_invite_id ?? null,
      },
    })

    await logPortalEvent({
      userId,
      eventType: 'signup_requested',
      category: 'accounts',
      severity: suspicious ? 'warning' : 'success',
      title: suspicious ? 'Suspicious analyzer signup quarantined' : 'New analyzer signup requested',
      message: normalizedEmail,
      metadata: {
        full_name: assessment.normalizedFullName,
        business_name: assessment.normalizedBusinessName,
        source: buildSignupSource(meta),
        signup_path: 'create_prospect',
        suspicious,
        signup_risk_score: assessment.riskScore,
        signup_reasons: assessment.reasons.join(', ') || null,
        page_url: complianceSnapshot.page_url,
        consent_text_version: complianceSnapshot.consent_text_version,
      },
      sendEmail: true,
    })

    if (crm_invite_id) {
      await linkCrmInviteAccount(supabase, {
        inviteId: crm_invite_id,
        userId,
        profileId: userId,
        email: normalizedEmail,
        createdBy: 'create_prospect',
        metadata: { source: 'create_prospect' },
      }).catch(() => {})

      if (analyzer_result) {
        await markCrmInviteEvent(supabase, {
          inviteId: crm_invite_id,
          status: 'analyzer_submitted',
          createdBy: 'create_prospect',
          metadata: { source: 'create_prospect' },
        }).catch(() => {})
      }
    }

    // Enroll in 30-day free nurture sequence (fire-and-forget)
    void supabase
      .from('nurture_enrollments')
      .insert({ user_id: userId })
      .then(({ error }) => {
        if (error) {
          console.error('Nurture enrollment failed (non-fatal):', error)
        }
      })

    // Send welcome email (fire-and-forget)
    if (analyzer_result?.assigned_program) {
      const PROGRAM_LABELS: Record<string, string> = {
        program_a: 'Program A — 0% Intro APR Card Strategy',
        program_b: 'Program B — Business Credit Builder',
        program_c: 'Program C — Capital Monitoring Membership',
      }
      sendWelcomeEmail({
        toEmail: normalizedEmail,
        toName: assessment.normalizedFullName,
        programLabel: PROGRAM_LABELS[analyzer_result.assigned_program] ?? analyzer_result.assigned_program,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, user_id: userId })
  } catch (error) {
    console.error('create-prospect error:', error)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
