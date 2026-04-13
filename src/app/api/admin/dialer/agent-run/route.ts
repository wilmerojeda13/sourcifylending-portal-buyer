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

const BLACKLISTED_INDUSTRY_TERMS_AR = [
  'government', ' gov ', '.gov', 'federal', 'state of ', 'city of ', 'county of ',
  'department of ', 'dept of ', 'office of ',
  'non-profit', 'nonprofit', 'non profit', '501(c)', '501c3', 'charity', 'foundation',
  'fire department', 'fire dept', 'fire station', 'fire district',
  'county office', 'county clerk', 'county sheriff',
  'public works', 'public school', 'school district', 'unified school',
  'municipality', 'municipal', 'township', 'city hall',
  'police department', 'police dept', 'sheriff', 'corrections',
]

const INFERENCE_MAP_AR: Array<{ keywords: string[]; industry: string }> = [
  { keywords: ['construc', 'contractor', 'contracting', 'builder', 'remodel', 'roofing', 'plumbing', 'hvac', 'electrician', 'flooring', 'concrete', 'landscap', 'paving', 'masonry'], industry: 'Construction' },
  { keywords: ['truck', 'transport', 'freight', 'logistics', 'hauling', 'courier', 'dispatch', 'delivery', 'moving', 'carrier', 'shipping'], industry: 'Transportation/Trucking' },
  { keywords: ['real estate', 'realty', 'realtor', 'properties', 'property mgmt', 'property management', 'apartment'], industry: 'Real Estate' },
  { keywords: ['medical', 'clinic', 'dental', 'dentist', 'therapy', 'therapist', 'healthcare', 'chiro', 'pharmacy', 'urgent care', 'physical therapy', 'veterinar'], industry: 'Healthcare' },
  { keywords: ['ecommerce', 'e-commerce', 'online store', 'shopify', 'dropship'], industry: 'E-commerce' },
  { keywords: ['restaurant', 'cafe', 'catering', 'bakery', 'diner', 'pizza', 'grill', 'bbq', 'food service', 'bistro'], industry: 'Restaurants/Food' },
  { keywords: ['manufactur', 'fabricat', 'machining', 'assembly', 'industrial', 'welding'], industry: 'Manufacturing' },
  { keywords: ['consult', 'advisory', 'solutions', 'services', 'group', 'associates', 'partners', 'agency', 'staffing', 'marketing', 'accounting', 'cpa', 'attorney', 'legal', 'insurance'], industry: 'Professional Services' },
]

function inferIndustryAR(businessName: string | null | undefined): string | null {
  if (!businessName) return null
  const lower = businessName.toLowerCase()
  for (const entry of INFERENCE_MAP_AR) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.industry
    }
  }
  return null
}

function isJunkLead(lead: { first_name?: string | null; email?: string | null; last_name?: string | null; business_name?: string | null; notes?: string | null; industry?: string | null }): boolean {
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
  const keywordsArray = Array.from(JUNK_KEYWORDS)
  for (const keyword of keywordsArray) {
    if (allText.includes(keyword)) {
      return true
    }
  }

  // Check 7: Blacklisted industry / company name
  const industryHaystack = `${lead.industry ?? ''} ${lead.business_name ?? ''}`.toLowerCase()
  for (const term of BLACKLISTED_INDUSTRY_TERMS_AR) {
    if (industryHaystack.includes(term)) return true
  }

  return false
}

function isProfessionalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  if (FORBIDDEN_DOMAINS.has(domain)) return false
  const forbiddenArray = Array.from(FORBIDDEN_DOMAINS)
  for (const forbidden of forbiddenArray) {
    if (domain === forbidden || domain.endsWith(`.${forbidden}`)) {
      return false
    }
  }
  return true
}

// Scrub dialer_raw_leads for professional emails -> high_priority stage
// GLOBAL SEARCH: Scans entire 6,000+ lead database, not just campaign leads
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

    // GLOBAL SEARCH: Get ALL unassigned leads from entire database
    // First, get IDs of leads already in ANY campaign to avoid re-processing
    const { data: assignedLeads } = await serviceClient
      .from('dialer_campaign_leads')
      .select('raw_lead_id')

    const assignedSet = new Set((assignedLeads ?? []).map(l => l.raw_lead_id))

    // Build query for ALL unassigned dialer_raw_leads
    const { data: leads, error } = await serviceClient
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, phone, email, business_name, industry, notes, stage, source, is_archived, promoted_to_crm_lead_id')
      .eq('is_archived', false)
      .not('email', 'is', null)
      .neq('stage', 'high_priority')
      .is('promoted_to_crm_lead_id', null)
      .is('last_call_at', null) // Never called globally
      .limit(5000) // Scan up to 5000 leads at once

    if (error) throw new Error(`Failed to fetch leads: ${error.message}`)
    if (!leads || leads.length === 0) {
      return { processed: 0, upgraded: 0, errors: [] }
    }

    for (const lead of leads) {
      processed++
      if (!lead.email) continue

      // Skip leads already assigned to any campaign
      if (assignedSet.has(lead.id)) continue

      // Skip junk/SMS leads
      if (isJunkLead(lead)) {
        errors.push(`Skipped junk lead ${lead.id}: ${lead.first_name}`)
        continue
      }

      if (isProfessionalEmail(lead.email)) {
        const inferredIndustry = (lead as { industry?: string | null }).industry || inferIndustryAR(lead.business_name)
        const { error: updateError } = await serviceClient
          .from('dialer_raw_leads')
          .update({ stage: 'high_priority', industry: inferredIndustry ?? null, updated_at: new Date().toISOString() })
          .eq('id', lead.id)

        if (updateError) {
          errors.push(`Failed to upgrade lead ${lead.id}: ${updateError.message}`)
          continue
        }

        upgraded++

        // AUTO-INGEST: Add qualified lead directly to scrub campaign
        if (campaign) {
          await serviceClient
            .from('dialer_campaign_leads')
            .upsert({
              campaign_id: campaign.id,
              raw_lead_id: lead.id,
              sort_order: 0,
            }, { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true })
        }

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
