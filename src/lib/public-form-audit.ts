import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { assessSignup, getSignupRequestMeta, verifyTurnstileToken } from '@/lib/signup-security'
import type { ComplianceSnapshot } from '@/lib/public-form-compliance'

export type PublicFormSecurityEventType =
  | 'attempt'
  | 'blocked_rate_limit'
  | 'blocked_validation'
  | 'blocked_disposable'
  | 'blocked_captcha'
  | 'accepted'

const MAX_FORM_SUBMISSIONS_PER_IP_PER_HOUR = 12
const MAX_FORM_SUBMISSIONS_PER_EMAIL_PER_HOUR = 6

export async function logPublicFormSecurityEvent(args: {
  formName: string
  eventType: PublicFormSecurityEventType
  req: NextRequest
  email?: string | null
  fullName?: string | null
  businessName?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    const supabase = await createServiceClient()
    const meta = getSignupRequestMeta(args.req)
    await supabase.from('public_form_security_events').insert({
      form_name: args.formName,
      email: args.email?.trim().toLowerCase() || null,
      full_name: args.fullName?.trim() || null,
      business_name: args.businessName?.trim() || null,
      ip_address: meta.ipAddress,
      user_agent: meta.userAgent,
      event_type: args.eventType,
      metadata: args.metadata ?? {},
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[public-form-audit] failed to log form security event', error)
  }
}

export async function enforcePublicFormRateLimit(args: {
  formName: string
  email?: string | null
  ipAddress?: string | null
}) {
  const supabase = await createServiceClient()
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [ipCountRes, emailCountRes] = await Promise.all([
    args.ipAddress
      ? supabase
          .from('public_form_security_events')
          .select('id', { count: 'exact', head: true })
          .eq('form_name', args.formName)
          .eq('ip_address', args.ipAddress)
          .gte('created_at', windowStart)
      : Promise.resolve({ count: 0 }),
    args.email
      ? supabase
          .from('public_form_security_events')
          .select('id', { count: 'exact', head: true })
          .eq('form_name', args.formName)
          .eq('email', args.email)
          .gte('created_at', windowStart)
      : Promise.resolve({ count: 0 }),
  ])

  const ipCount = 'count' in ipCountRes ? ipCountRes.count ?? 0 : 0
  const emailCount = 'count' in emailCountRes ? emailCountRes.count ?? 0 : 0

  return {
    blocked: ipCount >= MAX_FORM_SUBMISSIONS_PER_IP_PER_HOUR || emailCount >= MAX_FORM_SUBMISSIONS_PER_EMAIL_PER_HOUR,
    ipCount,
    emailCount,
  }
}

export function assessPublicFormIdentity(args: {
  email?: string | null
  fullName?: string | null
  businessName?: string | null
}) {
  const assessment = assessSignup({
    email: args.email ?? '',
    fullName: args.fullName ?? 'Unknown',
    businessName: args.businessName ?? 'Unknown',
  })

  return {
    ...assessment,
    email: assessment.normalizedEmail,
  }
}

export async function requirePublicFormCaptcha(token: string | null) {
  return verifyTurnstileToken(token)
}

export async function recordConsentRecord(args: {
  formName: string
  snapshot: ComplianceSnapshot
  email?: string | null
  fullName?: string | null
  businessName?: string | null
  phone?: string | null
  leadId?: string | null
  userId?: string | null
  profileId?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    const supabase = await createServiceClient()
    await supabase.from('public_form_consent_records').insert({
      form_name: args.formName,
      page_url: args.snapshot.page_url,
      submitted_at: args.snapshot.timestamp,
      consent_text_version: args.snapshot.consent_text_version,
      disclosure_text: args.snapshot.disclosure_text ?? null,
      consent_given: args.snapshot.consent_given ?? false,
      email: args.email?.trim().toLowerCase() || null,
      full_name: args.fullName?.trim() || null,
      business_name: args.businessName?.trim() || null,
      phone: args.phone?.trim() || null,
      ip_address: args.snapshot.ip_address,
      user_agent: args.snapshot.user_agent,
      related_lead_id: args.leadId ?? null,
      related_user_id: args.userId ?? null,
      related_profile_id: args.profileId ?? null,
      metadata: args.metadata ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[public-form-audit] failed to record consent record', error)
  }
}
