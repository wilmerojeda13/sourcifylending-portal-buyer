import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// HARD GATEKEEPER - STRICT HUMAN CHECK
// Rules:
// 1. MUST have first_name (string, not empty)
// 2. MUST have email (string, not empty)  
// 3. Email MUST contain '@'
// 4. Email MUST NOT be consumer domain
// 5. first_name MUST NOT contain >3 consecutive digits (4+ = REJECT)

const FORBIDDEN_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
  'gmx.com', 'gmx.net', 'qq.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'foxmail.com', 'hey.com', 'fastmail.com'
])

// STRICT: 4+ consecutive digits = REJECT
const JUNK_DIGIT_REGEX = /\d{4,}/

// SMS/Junk keywords
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'text stop', 'help info', 'auto-confirm',
  'automated message', 'do not reply', 'sms terms',
  'terms and conditions', 'privacy policy', 'carrier rates',
  'msg&data', 'msg & data', 'data rates',
])

function isJunkLead(lead: { first_name?: string | null; email?: string | null; last_name?: string | null; business_name?: string | null; notes?: string | null }): boolean {
  // Check 1: MUST have first_name
  if (!lead.first_name || typeof lead.first_name !== 'string' || lead.first_name.trim() === '') {
    return true
  }
  
  // Check 2: MUST have email
  if (!lead.email || typeof lead.email !== 'string' || lead.email.trim() === '') {
    return true
  }
  
  const firstName = lead.first_name.trim()
  const email = lead.email.trim().toLowerCase()
  
  // Check 3: Email MUST contain '@'
  if (!email.includes('@')) {
    return true
  }
  
  // Check 4: MUST NOT be forbidden domain
  const domain = email.split('@')[1]
  if (!domain || FORBIDDEN_DOMAINS.has(domain)) {
    return true
  }
  
  // Check 5: first_name MUST NOT have 4+ consecutive digits
  if (JUNK_DIGIT_REGEX.test(firstName)) {
    return true
  }
  
  // Check 6: No junk keywords anywhere
  const allText = `${firstName} ${lead.last_name || ''} ${email} ${lead.business_name || ''} ${lead.notes || ''}`.toLowerCase()
  for (const keyword of JUNK_KEYWORDS) {
    if (allText.includes(keyword)) {
      return true
    }
  }
  
  return false
}

function isProfessionalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  if (FORBIDDEN_DOMAINS.has(domain)) return false
  for (const forbidden of FORBIDDEN_DOMAINS) {
    if (domain === forbidden || domain.endsWith(`.${forbidden}`)) {
      return false
    }
  }
  return true
}

// Scrub dialer_raw_leads for professional emails -> high_priority stage
async function scrubDialerLeadsForPriority(supabase: ReturnType<typeof createServiceClient>) {
  const errors: string[] = []
  let processed = 0
  let upgraded = 0
  const serviceClient = await supabase

  try {
    // Find the scrub campaign
    const { data: campaign } = await serviceClient
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', 'all data scrub campaign')
      .eq('status', 'active')
      .single()

    // Build query for dialer_raw_leads
    let query = serviceClient
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, phone, email, business_name, stage, source, is_archived, promoted_to_crm_lead_id')
      .eq('is_archived', false)
      .not('email', 'is', null)
      .neq('stage', 'high_priority')
      .is('promoted_to_crm_lead_id', null)

    // If campaign exists, filter to campaign leads
    if (campaign) {
      const { data: campaignLeadIds } = await serviceClient
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .eq('campaign_id', campaign.id)

      if (campaignLeadIds && campaignLeadIds.length > 0) {
        const ids = campaignLeadIds.map(cl => cl.raw_lead_id)
        query = query.in('id', ids)
      }
    }

    const { data: leads, error } = await query

    if (error) throw new Error(`Failed to fetch leads: ${error.message}`)
    if (!leads || leads.length === 0) {
      return { processed: 0, upgraded: 0, errors: [] }
    }

    for (const lead of leads) {
      processed++
      if (!lead.email) continue

      // Skip junk/SMS leads
      if (isJunkLead(lead)) {
        errors.push(`Skipped junk lead ${lead.id}: ${lead.first_name}`)
        continue
      }

      if (isProfessionalEmail(lead.email)) {
        const { error: updateError } = await serviceClient
          .from('dialer_raw_leads')
          .update({ stage: 'high_priority', updated_at: new Date().toISOString() })
          .eq('id', lead.id)

        if (updateError) {
          errors.push(`Failed to upgrade lead ${lead.id}: ${updateError.message}`)
          continue
        }

        upgraded++

        // Audit log
        await serviceClient.from('crm_audit_logs').insert({
          action_type: 'stage_updated',
          entity_type: 'lead',
          entity_ids: [lead.id],
          summary: `Lead auto-upgraded to High Priority: Professional email detected`,
          details: {
            email: lead.email,
            domain: lead.email.split('@')[1],
            previous_stage: lead.stage,
            new_stage: 'high_priority',
            automated: true,
            source: 'lead-processor-agent',
          },
          performed_by_name: 'Lead Processor Agent',
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error: ${message}`)
  }

  return { processed, upgraded, errors }
}

export async function GET(request: Request) {
  // Security: Verify CRON_SECRET
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const result = await scrubDialerLeadsForPriority(supabase)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      scrubbed: result.processed,
      upgraded: result.upgraded,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: message,
    }, { status: 500 })
  }
}
