import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'
import { logPortalEvent } from '@/lib/portal-events'
import { parseContentAttributionCookie, recordContentEvent } from '@/lib/content-engine'
import { getSignupRequestMeta } from '@/lib/signup-security'
import {
  assessPublicFormIdentity,
  enforcePublicFormRateLimit,
  logPublicFormSecurityEvent,
  recordConsentRecord,
  requirePublicFormCaptcha,
} from '@/lib/public-form-audit'
import {
  buildComplianceSnapshot,
  formatComplianceSnapshotLines,
  validateCompliancePayload,
  type CompliancePayload,
} from '@/lib/public-form-compliance'

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? fullName.trim(),
    lastName: parts.slice(1).join(' '),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      full_name?: string
      business_name?: string
      email?: string
      phone?: string
      message?: string
      consent?: boolean
      website?: string
      turnstileToken?: string | null
      compliance?: CompliancePayload
    }

    const fullName = body.full_name?.trim() ?? ''
    const businessName = body.business_name?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    const phone = body.phone?.trim() ?? ''
    const message = body.message?.trim() ?? ''

    if (body.website) {
      await logPublicFormSecurityEvent({
        formName: 'public_get_started',
        eventType: 'blocked_validation',
        req,
        email,
        fullName,
        businessName,
        metadata: { reason: 'honeypot_triggered' },
      })
      return NextResponse.json({ error: 'Unable to submit form.' }, { status: 400 })
    }

    if (!fullName || !businessName || !email || !phone) {
      return NextResponse.json({ error: 'Name, business, email, and phone are required.' }, { status: 400 })
    }

    await logPublicFormSecurityEvent({
      formName: 'public_get_started',
      eventType: 'attempt',
      req,
      email,
      fullName,
      businessName,
    })

    const complianceValidation = validateCompliancePayload(body.compliance, 'public_get_started')
    if (!complianceValidation.ok) {
      return NextResponse.json({ error: complianceValidation.error }, { status: 400 })
    }

    const identityAssessment = assessPublicFormIdentity({
      email,
      fullName,
      businessName,
    })
    if (identityAssessment.isBlocked) {
      await logPublicFormSecurityEvent({
        formName: 'public_get_started',
        eventType: identityAssessment.isDisposableDomain ? 'blocked_disposable' : 'blocked_validation',
        req,
        email: identityAssessment.email,
        fullName,
        businessName,
        metadata: { reasons: identityAssessment.reasons },
      })
      return NextResponse.json({ error: 'Please use a valid business identity and email.' }, { status: 400 })
    }

    const requestMeta = getSignupRequestMeta(req)
    const rateLimit = await enforcePublicFormRateLimit({
      formName: 'public_get_started',
      email: identityAssessment.email,
      ipAddress: requestMeta.ipAddress,
    })
    if (rateLimit.blocked) {
      await logPublicFormSecurityEvent({
        formName: 'public_get_started',
        eventType: 'blocked_rate_limit',
        req,
        email: identityAssessment.email,
        fullName,
        businessName,
        metadata: {
          ip_count_last_hour: rateLimit.ipCount,
          email_count_last_hour: rateLimit.emailCount,
        },
      })
      return NextResponse.json({ error: 'Too many submissions. Please wait and try again.' }, { status: 429 })
    }

    const captchaOk = await requirePublicFormCaptcha(body.turnstileToken ?? null)
    if (!captchaOk) {
      await logPublicFormSecurityEvent({
        formName: 'public_get_started',
        eventType: 'blocked_captcha',
        req,
        email: identityAssessment.email,
        fullName,
        businessName,
      })
      return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
    }

    const { firstName, lastName } = splitName(fullName)
    const complianceSnapshot = buildComplianceSnapshot(req, body.compliance!)
    const contentAttribution = parseContentAttributionCookie(req.cookies.get('sl_content_attribution')?.value)
    const phoneIntelligence = await inferLeadPhoneIntelligence(phone)

    const consentNote = [
      '[Public Consent Form]',
      ...formatComplianceSnapshotLines(complianceSnapshot, 'Public Consent Form Compliance'),
      message ? `Lead Message: ${message}` : null,
      '[/Public Consent Form]',
    ].filter(Boolean).join('\n')

    const supabase = await createServiceClient()

    const { data: existingLead } = await supabase
      .from('crm_leads')
      .select('id, notes')
      .or(`email.eq.${email},phone.eq.${phone}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let leadId: string | null = null

    if (existingLead) {
      const mergedNotes = existingLead.notes?.includes('[Public Consent Form]')
        ? existingLead.notes
        : `${consentNote}\n\n${existingLead.notes?.trim() ?? ''}`.trim()

      const { data: updatedLead, error: updateError } = await supabase
        .from('crm_leads')
        .update({
          first_name: firstName,
          last_name: lastName,
          business_name: businessName,
          email,
          phone,
          source: 'inbound',
          notes: mergedNotes,
          phone_e164: phoneIntelligence.phone_e164,
          likely_timezone: phoneIntelligence.likely_timezone,
          timezone_confidence: phoneIntelligence.timezone_confidence,
          timezone_source: phoneIntelligence.timezone_source,
          last_timezone_checked_at: phoneIntelligence.last_timezone_checked_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)
        .select('id')
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      leadId = updatedLead.id
    } else {
      const { data: createdLead, error: createError } = await supabase
        .from('crm_leads')
        .insert({
          first_name: firstName,
          last_name: lastName,
          business_name: businessName,
          email,
          phone,
          source: 'inbound',
          stage: 'new',
          notes: consentNote,
          lead_temperature: 'warm',
          close_probability: 20,
          phone_e164: phoneIntelligence.phone_e164,
          likely_timezone: phoneIntelligence.likely_timezone,
          timezone_confidence: phoneIntelligence.timezone_confidence,
          timezone_source: phoneIntelligence.timezone_source,
          last_timezone_checked_at: phoneIntelligence.last_timezone_checked_at,
        })
        .select('id')
        .single()

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }

      leadId = createdLead.id
    }

    await logPortalEvent({
      eventType: 'public_consent_form_submitted',
      category: 'leads',
      title: 'Public consent form submitted',
      message: `${fullName} submitted the public intake form.`,
        metadata: {
          lead_id: leadId,
          email,
          phone,
          business_name: businessName,
          page_url: complianceSnapshot.page_url,
          sms_consent: true,
          consent_text_version: complianceSnapshot.consent_text_version,
        },
      severity: 'success',
      sendEmail: true,
    })

    if (contentAttribution?.pageId && leadId) {
      await recordContentEvent({
        pageId: contentAttribution.pageId,
        eventType: 'lead',
        relatedRecordId: leadId,
        metadata: {
          source: 'public_get_started',
          page_url: complianceSnapshot.page_url,
          business_name: businessName,
          email,
        },
      })
    }

    await logPublicFormSecurityEvent({
      formName: 'public_get_started',
      eventType: 'accepted',
      req,
      email: identityAssessment.email,
      fullName,
      businessName,
      metadata: { lead_id: leadId },
    })

    await recordConsentRecord({
      formName: 'public_get_started',
      snapshot: complianceSnapshot,
      email: identityAssessment.email,
      fullName,
      businessName,
      phone,
      leadId,
      metadata: {
        source: 'public_get_started',
        message_present: Boolean(message),
      },
    })

    return NextResponse.json({ success: true, lead_id: leadId })
  } catch (error) {
    console.error('[public/lead-capture] unexpected error', error)
    return NextResponse.json({ error: 'Unable to submit form right now.' }, { status: 500 })
  }
}
