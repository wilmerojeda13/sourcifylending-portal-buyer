import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { routeAnalyzer } from '@/lib/program-router'
import { sendAnalyzerResultEmail } from '@/lib/email'
import { logPortalEvent } from '@/lib/portal-events'
import { upsertAnalyzerCrmLead } from '@/lib/analyzer-crm'
import { markCrmInviteEvent } from '@/lib/crm-invites'
import { recordAnalyzerSessionEvent } from '@/lib/crm-analyzer-sessions'
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
import type { AnalyzerInput } from '@/types'

const NOTION_API_VERSION = '2022-06-28'
const NOTION_CONTACTS_DS_ID = '712087e3-6c7d-4978-8e1a-4ed6e1b3470c'

const PROGRAM_NOTION_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring',
}

interface LeadPayload {
  full_name: string
  email: string
  phone?: string
  business_name?: string
  answers: Record<string, string>
  crm_invite_id?: string | null
  crm_analyzer_session_id?: string | null
  turnstileToken?: string | null
  compliance?: CompliancePayload
}

async function findNotionContactByEmail(email: string): Promise<string | null> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) return null

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_CONTACTS_DS_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'Email',
        email: { equals: email },
      },
      page_size: 1,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.id ?? null
}

async function createNotionContact(lead: LeadPayload, result: ReturnType<typeof routeAnalyzer>): Promise<string | null> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) return null

  const today = new Date().toISOString().split('T')[0]

  const programLabel = PROGRAM_NOTION_LABELS[result.assigned_program] ?? null

  const properties: Record<string, unknown> = {
    'Contact Name': { title: [{ text: { content: lead.full_name } }] },
    Email: { email: lead.email },
    Source: { select: { name: 'Website' } },
    Disposition: { select: { name: 'New Lead' } },
    Status: { select: { name: 'Active' } },
    'Date Received': { date: { start: today } },
    Notes: {
      rich_text: [
        {
          text: {
            content: [
              `Source: Free Analyzer`,
              `Readiness: ${result.readiness_status}`,
              `Program: ${result.assigned_program}`,
              result.risk_flags.length > 0 ? `Risk Flags: ${result.risk_flags.join(', ')}` : null,
              lead.business_name ? `Business: ${lead.business_name}` : null,
            ].filter(Boolean).join('\n'),
          },
        },
      ],
    },
  }

  if (lead.phone) properties['Phone'] = { phone_number: lead.phone }
  if (lead.business_name) properties['Business'] = { rich_text: [{ text: { content: lead.business_name } }] }
  if (programLabel) properties['Program Enrolled'] = { select: { name: programLabel } }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_CONTACTS_DS_ID },
      properties,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Notion create contact error:', err)
    return null
  }

  const data = await res.json()
  return data.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as LeadPayload
    const contentAttribution = parseContentAttributionCookie(req.cookies.get('sl_content_attribution')?.value)

    const { full_name, email, phone, business_name, answers, crm_invite_id, crm_analyzer_session_id } = body

    if (!full_name || !email) {
      return NextResponse.json({ error: 'full_name and email are required' }, { status: 400 })
    }
    let complianceSnapshot: ReturnType<typeof buildComplianceSnapshot> | null = null
    if (body.compliance) {
      await logPublicFormSecurityEvent({
        formName: 'public_analyzer_contact_gate',
        eventType: 'attempt',
        req,
        email,
        fullName: full_name,
        businessName: business_name || answers.business_name,
      })
      const complianceValidation = validateCompliancePayload(body.compliance, 'public_analyzer_contact_gate')
      if (!complianceValidation.ok) {
        return NextResponse.json({ error: complianceValidation.error }, { status: 400 })
      }

      const identityAssessment = assessPublicFormIdentity({
        email,
        fullName: full_name,
        businessName: business_name || answers.business_name,
      })
      if (identityAssessment.isBlocked) {
        await logPublicFormSecurityEvent({
          formName: 'public_analyzer_contact_gate',
          eventType: identityAssessment.isDisposableDomain ? 'blocked_disposable' : 'blocked_validation',
          req,
          email: identityAssessment.email,
          fullName: full_name,
          businessName: business_name || answers.business_name,
          metadata: { reasons: identityAssessment.reasons },
        })
        return NextResponse.json({ error: 'Please use a valid business identity and email.' }, { status: 400 })
      }

      const requestMeta = getSignupRequestMeta(req)
      const rateLimit = await enforcePublicFormRateLimit({
        formName: 'public_analyzer_contact_gate',
        email: identityAssessment.email,
        ipAddress: requestMeta.ipAddress,
      })
      if (rateLimit.blocked) {
        await logPublicFormSecurityEvent({
          formName: 'public_analyzer_contact_gate',
          eventType: 'blocked_rate_limit',
          req,
          email: identityAssessment.email,
          fullName: full_name,
          businessName: business_name || answers.business_name,
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
          formName: 'public_analyzer_contact_gate',
          eventType: 'blocked_captcha',
          req,
          email: identityAssessment.email,
          fullName: full_name,
          businessName: business_name || answers.business_name,
        })
        return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
      }

      complianceSnapshot = buildComplianceSnapshot(req, body.compliance)
    }

    // Run the analyzer to get results
    const input: AnalyzerInput = {
      business_name: answers.business_name || business_name || '',
      business_age: answers.business_age || '',
      entity_type: answers.entity_type || '',
      industry: answers.industry || '',
      monthly_revenue_range: answers.monthly_revenue_range || '',
      monthly_deposit_range: answers.monthly_deposit_range || '',
      nsf_last_90_days: answers.nsf_last_90_days === 'true',
      credit_score_range: answers.credit_score_range || '',
      utilization_range: answers.utilization_range || '',
      inquiry_count_last_90_days: answers.inquiry_count_last_90_days || '',
      business_credit_reporting_status: answers.business_credit_reporting_status || '',
      primary_goal: (answers.primary_goal as AnalyzerInput['primary_goal']) || 'build_ein_credit',
    }

    const result = routeAnalyzer(input)

    const supabase = await createServiceClient()
    const normalizedEmail = email.toLowerCase().trim()

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, full_name, business_name, account_state, lead_id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    const submittedAt = new Date().toISOString()
    const scoreBreakdown = {
      top_blockers: result.top_blockers,
      recommendation: result.recommendation,
      recommended_next_step: result.recommended_next_step,
      upgrade_cta: result.upgrade_cta,
    }

    // Upsert lead into Supabase (deduped by email + source)
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, notion_page_id')
      .eq('email', normalizedEmail)
      .eq('source', 'free_analyzer')
      .maybeSingle()

    let notionPageId: string | null = existingLead?.notion_page_id ?? null
    let isNewLead = !existingLead
    let leadId: string | null = existingLead?.id ?? null

    if (!existingLead && !existingProfile) {
      // Insert new lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          full_name,
          email: normalizedEmail,
          phone: phone || null,
          business_name: business_name || null,
          source: 'free_analyzer',
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
          readiness_score: result.readiness_score,
          estimated_funding_range: result.estimated_funding_range,
          risk_flags: result.risk_flags,
          analyzer_answers: answers,
          summary: result.summary,
          score_breakdown: scoreBreakdown,
          raw_result_payload: result,
          submitted_at: submittedAt,
        })
        .select('id')
        .single()

      if (newLead) {
        leadId = newLead.id
      } else {
        console.error('Failed to insert lead')
      }
    } else {
      if (existingLead) {
        // Update existing lead with latest analyzer data
        await supabase
          .from('leads')
          .update({
            full_name,
            phone: phone || null,
            business_name: business_name || null,
            assigned_program: result.assigned_program,
            readiness_status: result.readiness_status,
            readiness_score: result.readiness_score,
            estimated_funding_range: result.estimated_funding_range,
            risk_flags: result.risk_flags,
            analyzer_answers: answers,
            summary: result.summary,
            score_breakdown: scoreBreakdown,
            raw_result_payload: result,
            submitted_at: submittedAt,
            ...(existingProfile?.id ? { converted_to_user_id: existingProfile.id } : {}),
          })
          .eq('id', existingLead.id)

        leadId = existingLead.id
      }
    }

    if (existingProfile) {
      await supabase
        .from('profiles')
        .update({
          ...(full_name && !existingProfile.full_name ? { full_name } : {}),
          ...(business_name && !existingProfile.business_name ? { business_name } : {}),
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
          latest_analyzer_result: result,
          analyzed_at: submittedAt,
          ...(existingLead?.id ? { lead_id: existingLead.id } : {}),
          updated_at: submittedAt,
        })
        .eq('id', existingProfile.id)

      await supabase.from('activity_logs').insert({
        user_id: existingProfile.id,
        event_type: 'analyzer_completed',
        event_data: {
          source: 'free_analyzer_guest_rerun',
          readiness_status: result.readiness_status,
          readiness_score: result.readiness_score,
          estimated_funding_range: result.estimated_funding_range,
          program_recommended: result.assigned_program,
        },
        created_at: new Date().toISOString(),
      }).then(() => {})
    }

    // ── Log to activity feed (portal_events) for new leads ──
    if (isNewLead) {
      logPortalEvent({
        eventType: 'new_lead_analyzer',
        category: 'leads',
        title: `New Lead: ${full_name}`,
        message: `Completed the free analyzer. Readiness: ${result.readiness_status}. Program: ${result.assigned_program}.`,
        metadata: {
          email: normalizedEmail,
          ...(phone ? { phone } : {}),
          ...(business_name ? { business: business_name } : {}),
          readiness: result.readiness_status,
          program: result.assigned_program,
          ...(complianceSnapshot ? {
            page_url: complianceSnapshot.page_url,
            consent_text_version: complianceSnapshot.consent_text_version,
          } : {}),
          ...(result.risk_flags.length > 0 ? { risk_flags: result.risk_flags.join(', ') } : {}),
        },
        severity: result.readiness_status === 'Ready' ? 'success' : 'info',
      }).catch(() => {})
    } else if (existingProfile) {
      logPortalEvent({
        userId: existingProfile.id,
        eventType: 'member_analyzer_rerun',
        category: 'leads',
        title: `Analyzer Updated Existing Member: ${full_name}`,
        message: `A known member completed the free analyzer again. Their admin profile was refreshed instead of creating a duplicate lead.`,
        metadata: {
          email: normalizedEmail,
          account_state: existingProfile.account_state,
          ...(existingLead?.id ? { lead_id: existingLead.id } : {}),
          readiness_score: result.readiness_score,
          estimated_funding_range: result.estimated_funding_range,
          assigned_program: result.assigned_program,
        },
        severity: 'info',
      }).catch(() => {})
    }

    // ── Upsert into CRM (crm_leads) so analyzer completions always appear in sales ──
    try {
      const crmLead = await upsertAnalyzerCrmLead({
        supabase,
        fullName: full_name,
        email: normalizedEmail,
        phone,
        businessName: business_name,
        input,
        result,
        createIfMissing: true,
        complianceSnapshot: complianceSnapshot ?? undefined,
        userId: existingProfile?.id ?? null,
      })

      if (crmLead.action !== 'skipped') {
        logPortalEvent({
          eventType: crmLead.action === 'created' ? 'crm_contact_created' : 'crm_contact_updated',
          category: 'leads',
          title: `${crmLead.action === 'created' ? 'New CRM contact' : 'CRM contact updated'}: ${full_name}`,
          message: `Free analyzer completion ${crmLead.action === 'created' ? 'created' : 'updated'} a CRM contact.`,
          metadata: {
            lead_id: crmLead.id,
            email: normalizedEmail,
            source: 'free_business_analyzer',
            readiness_score: result.readiness_score,
            estimated_funding_range: result.estimated_funding_range,
            assigned_program: result.assigned_program,
            duplicate_review_required: crmLead.duplicateRisk ?? false,
            task_created: crmLead.taskCreated ?? false,
            notification_sent: crmLead.notificationSent ?? false,
          },
          severity: 'info',
        }).catch(() => {})
      }
    } catch (crmErr) {
      console.error('CRM upsert error (non-fatal):', crmErr)
    }

    // Sync to Notion (non-blocking — don't fail the request if Notion fails)
    try {
      if (isNewLead) {
        // Check if contact already exists in Notion by email first
        const existingNotionId = await findNotionContactByEmail(email.toLowerCase().trim())
        if (existingNotionId) {
          notionPageId = existingNotionId
        } else {
          notionPageId = await createNotionContact({ full_name, email, phone, business_name, answers }, result)
        }

        if (notionPageId) {
          await supabase
            .from('leads')
            .update({ notion_page_id: notionPageId, synced_to_notion: true })
            .eq('email', normalizedEmail)
            .eq('source', 'free_analyzer')
        }
      }
    } catch (notionErr) {
      console.error('Notion sync error (non-fatal):', notionErr)
    }

    // Send analyzer results email (fire-and-forget — never block the response)
    sendAnalyzerResultEmail({
      toEmail: normalizedEmail,
      toName: full_name,
      result,
      leadId,
      businessName: business_name,
    }).catch((e) => console.error('Analyzer email send error (non-fatal):', e))

    if (crm_invite_id) {
      await markCrmInviteEvent(supabase, {
        inviteId: crm_invite_id,
        status: 'analyzer_submitted',
        createdBy: 'analyzer',
        metadata: {
          source: 'analyzer',
          lead_id: leadId,
          email: normalizedEmail,
        },
      }).catch(() => {})
    }

    if (crm_analyzer_session_id) {
      await recordAnalyzerSessionEvent({
        supabase,
        sessionId: crm_analyzer_session_id,
        eventType: 'analyzer_submitted',
        eventAt: submittedAt,
        metadata: {
          lead_id: leadId,
          email: normalizedEmail,
        },
      }).catch(() => {})
      await recordAnalyzerSessionEvent({
        supabase,
        sessionId: crm_analyzer_session_id,
        eventType: 'readiness_score_generated',
        eventAt: submittedAt,
        metadata: {
          lead_id: leadId,
          email: normalizedEmail,
          readiness_score: result.readiness_score,
          readiness_status: result.readiness_status,
          analyzer_summary: result.summary,
          score_breakdown: scoreBreakdown,
        },
      }).catch(() => {})
    }

    if (contentAttribution?.pageId && leadId) {
      await recordContentEvent({
        pageId: contentAttribution.pageId,
        eventType: 'lead',
        relatedRecordId: leadId,
        metadata: {
          source: 'public_analyzer',
          email: normalizedEmail,
          assigned_program: result.assigned_program,
        },
      })
    }

    if (complianceSnapshot) {
      await logPublicFormSecurityEvent({
        formName: 'public_analyzer_contact_gate',
        eventType: 'accepted',
        req,
        email,
        fullName: full_name,
        businessName: business_name || answers.business_name,
        metadata: { lead_id: leadId },
      })

      await recordConsentRecord({
        formName: 'public_analyzer_contact_gate',
        snapshot: complianceSnapshot,
        email,
        fullName: full_name,
        businessName: business_name || answers.business_name,
        phone: phone || null,
        leadId,
        metadata: {
          source: 'public_analyzer',
          assigned_program: result.assigned_program,
        },
      })
    }

    return NextResponse.json({ ...result, lead_id: leadId })
  } catch (error) {
    console.error('Lead analyzer error:', error)
    return NextResponse.json({ error: 'Failed to process lead' }, { status: 500 })
  }
}
