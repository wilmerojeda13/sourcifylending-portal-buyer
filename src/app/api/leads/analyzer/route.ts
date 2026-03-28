import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { routeAnalyzer } from '@/lib/program-router'
import { sendAnalyzerResultEmail } from '@/lib/email'
import { logPortalEvent } from '@/lib/portal-events'
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

    const { full_name, email, phone, business_name, answers } = body

    if (!full_name || !email) {
      return NextResponse.json({ error: 'full_name and email are required' }, { status: 400 })
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
      primary_goal: answers.primary_goal || 'build_ein_credit',
    }

    const result = routeAnalyzer(input)

    const supabase = await createServiceClient()

    // Upsert lead into Supabase (deduped by email + source)
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, notion_page_id')
      .eq('email', email.toLowerCase().trim())
      .eq('source', 'free_analyzer')
      .maybeSingle()

    let notionPageId: string | null = existingLead?.notion_page_id ?? null
    let isNewLead = !existingLead
    let leadId: string | null = existingLead?.id ?? null

    if (!existingLead) {
      // Insert new lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          full_name,
          email: email.toLowerCase().trim(),
          phone: phone || null,
          business_name: business_name || null,
          source: 'free_analyzer',
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
          risk_flags: result.risk_flags,
          analyzer_answers: answers,
        })
        .select('id')
        .single()

      if (newLead) {
        leadId = newLead.id
      } else {
        console.error('Failed to insert lead')
      }
    } else {
      // Update existing lead with latest analyzer data
      await supabase
        .from('leads')
        .update({
          full_name,
          phone: phone || null,
          business_name: business_name || null,
          assigned_program: result.assigned_program,
          readiness_status: result.readiness_status,
          risk_flags: result.risk_flags,
          analyzer_answers: answers,
        })
        .eq('id', existingLead.id)
    }

    // ── Log to activity feed (portal_events) for new leads ──
    if (isNewLead) {
      logPortalEvent({
        eventType: 'new_lead_analyzer',
        category: 'leads',
        title: `New Lead: ${full_name}`,
        message: `Completed the free analyzer. Readiness: ${result.readiness_status}. Program: ${result.assigned_program}.`,
        metadata: {
          email: email.toLowerCase().trim(),
          ...(phone ? { phone } : {}),
          ...(business_name ? { business: business_name } : {}),
          readiness: result.readiness_status,
          program: result.assigned_program,
          ...(result.risk_flags.length > 0 ? { risk_flags: result.risk_flags.join(', ') } : {}),
        },
        severity: result.readiness_status === 'ready' ? 'success' : 'info',
      }).catch(() => {})
    }

    // ── Upsert into CRM (crm_leads) so Abel can call them from the dialer ──
    try {
      const nameParts = full_name.trim().split(' ')
      const firstName = nameParts[0] ?? full_name
      const lastName = nameParts.slice(1).join(' ') || ''

      const crmNotes = [
        `Source: Free Analyzer`,
        `Readiness: ${result.readiness_status}`,
        `Program: ${result.assigned_program}`,
        result.risk_flags.length > 0 ? `Risk Flags: ${result.risk_flags.join(', ')}` : null,
        input.business_age ? `Business Age: ${input.business_age}` : null,
        input.monthly_revenue_range ? `Revenue: ${input.monthly_revenue_range}` : null,
        input.credit_score_range ? `Credit Score: ${input.credit_score_range}` : null,
      ].filter(Boolean).join('\n')

      await supabase.from('crm_leads').upsert(
        {
          first_name: firstName,
          last_name: lastName,
          email: email.toLowerCase().trim(),
          phone: phone || null,
          business_name: business_name || null,
          source: 'analyzer',
          stage: 'new',
          program_interest: result.assigned_program as 'program_a' | 'program_b' | 'program_c',
          notes: crmNotes,
        },
        { onConflict: 'email', ignoreDuplicates: false }
      )
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
            .eq('email', email.toLowerCase().trim())
            .eq('source', 'free_analyzer')
        }
      }
    } catch (notionErr) {
      console.error('Notion sync error (non-fatal):', notionErr)
    }

    // Send analyzer results email (fire-and-forget — never block the response)
    sendAnalyzerResultEmail({
      toEmail: email.toLowerCase().trim(),
      toName: full_name,
      result,
      leadId,
      businessName: business_name,
    }).catch((e) => console.error('Analyzer email send error (non-fatal):', e))

    return NextResponse.json({ ...result, lead_id: leadId })
  } catch (error) {
    console.error('Lead analyzer error:', error)
    return NextResponse.json({ error: 'Failed to process lead' }, { status: 500 })
  }
}
