import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Professional email domain check (mirrors lead-processor.ts logic)
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
  'gmx.com', 'gmx.net', 'qq.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'foxmail.com',
])

// SMS/Junk keywords that indicate automated replies or spam
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'reply stop to', 'text stop', 'help info',
  'auto-confirm', 'automated message', 'do not reply',
  'sms terms', 'terms and conditions', 'privacy policy',
  'carrier rates', 'msg&data', 'msg & data', 'data rates',
])

// Check for long sequences of digits (>4 in a row indicates random/junk)
function hasLongDigitSequence(value: string | null, maxDigits = 4): boolean {
  if (!value) return false
  const digitRuns = value.match(/\d{${maxDigits + 1},}/g)
  return !!digitRuns && digitRuns.length > 0
}

// Check for junk keywords in any text field
function containsJunkKeywords(value: string | null): boolean {
  if (!value) return false
  const lowerValue = value.toLowerCase()
  return Array.from(JUNK_KEYWORDS).some(keyword => lowerValue.includes(keyword))
}

// Check if a lead appears to be junk/SMS garbage
function isJunkLead(lead: { first_name?: string; last_name?: string | null; email?: string | null; business_name?: string | null; notes?: string | null }): boolean {
  const allText = [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.business_name,
    lead.notes,
  ].filter(Boolean).join(' ')

  // Check for long digit sequences in name or email
  if (hasLongDigitSequence(lead.first_name, 4)) return true
  if (hasLongDigitSequence(lead.email, 4)) return true

  // Check for junk keywords anywhere
  if (containsJunkKeywords(allText)) return true

  return false
}

function isProfessionalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  if (CONSUMER_EMAIL_DOMAINS.has(domain)) return false
  // Check subdomains of consumer providers
  const consumerDomainsArray = Array.from(CONSUMER_EMAIL_DOMAINS)
  for (const consumerDomain of consumerDomainsArray) {
    if (domain === consumerDomain || domain.endsWith(`.${consumerDomain}`)) {
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
