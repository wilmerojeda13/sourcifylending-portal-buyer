import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseContentAttributionCookie, recordContentEvent } from '@/lib/content-engine'
import {
  assessPublicFormIdentity,
  enforcePublicFormRateLimit,
  logPublicFormSecurityEvent,
  recordConsentRecord,
  requirePublicFormCaptcha,
} from '@/lib/public-form-audit'
import { getSignupRequestMeta } from '@/lib/signup-security'
import {
  buildComplianceSnapshot,
  validateCompliancePayload,
  type CompliancePayload,
} from '@/lib/public-form-compliance'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      email,
      phone,
      company_name,
      website_or_social,
      promotion_plan,
      referral_experience,
      monthly_referral_estimate,
      marketing_channels,
      agreed_to_terms,
      turnstileToken,
      compliance,
    } = body
    await logPublicFormSecurityEvent({
      formName: 'public_partner_application',
      eventType: 'attempt',
      req,
      email,
      fullName: name,
      businessName: company_name,
    })

    const complianceValidation = validateCompliancePayload(
      compliance as CompliancePayload | undefined,
      'public_partner_application',
    )
    if (!complianceValidation.ok) {
      return NextResponse.json({ error: complianceValidation.error }, { status: 400 })
    }
    const complianceSnapshot = buildComplianceSnapshot(req, compliance as CompliancePayload)

    // Validation
    if (!name || !email || !promotion_plan) {
      await logPublicFormSecurityEvent({
        formName: 'public_partner_application',
        eventType: 'blocked_validation',
        req,
        email,
        fullName: name,
        businessName: company_name,
        metadata: { reason: 'missing_required_fields' },
      })
      return NextResponse.json({ error: 'Name, email, and promotion plan are required.' }, { status: 400 })
    }
    if (!agreed_to_terms) {
      return NextResponse.json({ error: 'You must agree to the terms.' }, { status: 400 })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const identityAssessment = assessPublicFormIdentity({
      email,
      fullName: name,
      businessName: company_name,
    })
    if (identityAssessment.isBlocked) {
      await logPublicFormSecurityEvent({
        formName: 'public_partner_application',
        eventType: identityAssessment.isDisposableDomain ? 'blocked_disposable' : 'blocked_validation',
        req,
        email: identityAssessment.email,
        fullName: name,
        businessName: company_name,
        metadata: { reasons: identityAssessment.reasons },
      })
      return NextResponse.json({ error: 'Please use a valid business identity and email.' }, { status: 400 })
    }

    const requestMeta = getSignupRequestMeta(req)
    const rateLimit = await enforcePublicFormRateLimit({
      formName: 'public_partner_application',
      email: identityAssessment.email,
      ipAddress: requestMeta.ipAddress,
    })
    if (rateLimit.blocked) {
      await logPublicFormSecurityEvent({
        formName: 'public_partner_application',
        eventType: 'blocked_rate_limit',
        req,
        email: identityAssessment.email,
        fullName: name,
        businessName: company_name,
        metadata: {
          ip_count_last_hour: rateLimit.ipCount,
          email_count_last_hour: rateLimit.emailCount,
        },
      })
      return NextResponse.json({ error: 'Too many submissions. Please wait and try again.' }, { status: 429 })
    }

    const captchaOk = await requirePublicFormCaptcha(turnstileToken ?? null)
    if (!captchaOk) {
      await logPublicFormSecurityEvent({
        formName: 'public_partner_application',
        eventType: 'blocked_captcha',
        req,
        email: identityAssessment.email,
        fullName: name,
        businessName: company_name,
      })
      return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const contentAttribution = parseContentAttributionCookie(req.cookies.get('sl_content_attribution')?.value)

    // Insert application (unique index on email+status='new' prevents duplicates)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || null

    const { data: insertedApplication, error: insertError } = await supabase.from('affiliate_applications').insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      company_name: company_name?.trim() || null,
      website_or_social: website_or_social?.trim() || null,
      promotion_plan: [
        promotion_plan.trim(),
        '',
        '[Partner Application Compliance]',
        `Page URL: ${complianceSnapshot.page_url}`,
        `Submitted: ${complianceSnapshot.timestamp}`,
        `Consent Text Version: ${complianceSnapshot.consent_text_version}`,
        `Disclosure Text: ${complianceSnapshot.disclosure_text}`,
        `IP Address: ${complianceSnapshot.ip_address}`,
        `User Agent: ${complianceSnapshot.user_agent}`,
        '[/Partner Application Compliance]',
      ].join('\n'),
      referral_experience: !!referral_experience,
      monthly_referral_estimate: monthly_referral_estimate || null,
      marketing_channels: marketing_channels || [],
      agreed_to_terms: !!agreed_to_terms,
      ip_address: ip,
    }).select('id').single()

    if (insertError) {
      if (insertError.code === '23505') {
        // Duplicate — already applied
        return NextResponse.json({
          error: 'An application from this email is already under review. We will be in touch soon.',
        }, { status: 409 })
      }
      throw insertError
    }

    await logPublicFormSecurityEvent({
      formName: 'public_partner_application',
      eventType: 'accepted',
      req,
      email: identityAssessment.email,
      fullName: name,
      businessName: company_name,
    })

    await recordConsentRecord({
      formName: 'public_partner_application',
      snapshot: complianceSnapshot,
      email: identityAssessment.email,
      fullName: name,
      businessName: company_name,
      phone: phone || null,
      metadata: {
        website_or_social: website_or_social || null,
        monthly_referral_estimate: monthly_referral_estimate || null,
      },
    })

    if (contentAttribution?.pageId && insertedApplication?.id) {
      await recordContentEvent({
        pageId: contentAttribution.pageId,
        eventType: 'partner_application',
        relatedRecordId: insertedApplication.id,
        metadata: {
          source: 'public_partner_application',
          email: identityAssessment.email,
          company_name: company_name || null,
        },
      })
    }

    // Send admin notification email (fire-and-forget)
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
          to: ['abel@sourcifylending.com'],
          subject: `New Affiliate Application: ${name}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
                <p style="color:#fff;font-size:18px;font-weight:700;margin:0">New Affiliate Application</p>
              </div>
              <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:160px">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600">${name}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:14px">${email}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:14px">${phone || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Company</td><td style="padding:8px 0;font-size:14px">${company_name || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Website/Social</td><td style="padding:8px 0;font-size:14px">${website_or_social || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Prior Experience</td><td style="padding:8px 0;font-size:14px">${referral_experience ? 'Yes' : 'No'}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Est. Monthly</td><td style="padding:8px 0;font-size:14px">${monthly_referral_estimate || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Channels</td><td style="padding:8px 0;font-size:14px">${(marketing_channels || []).join(', ') || '—'}</td></tr>
                </table>
                <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:8px">
                  <p style="color:#6b7280;font-size:12px;margin:0 0 6px">Promotion Plan:</p>
                  <p style="font-size:14px;color:#111827;margin:0">${promotion_plan}</p>
                </div>
                <div style="margin-top:20px">
                  <a href="https://sourcifylending.com/admin/affiliates/applications" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">Review in Admin Panel</a>
                </div>
              </div>
            </div>
          `,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Affiliate apply error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
