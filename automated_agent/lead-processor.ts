#!/usr/bin/env tsx
/**
 * SourcifyLending Always-On Lead Processor Agent
 *
 * Digital Nomad Workflow - Runs 24/7 with 30-minute intervals
 * 
 * Actions:
 * 1. Scans dialer_raw_leads in 'all data scrub campaign' for professional emails
 *    and updates stage to 'high_priority' (Indigo badge in UI)
 * 2. Scans crm_leads for professional emails and tags as 'High Priority'
 * 3. Creates 'Follow-Up' tasks for interested leads
 *
 * Tech Stack: Supabase (PostgreSQL) + TypeScript
 * Auth: Service Role Key (bypasses RLS for 24/7 operation)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables from parent directory
const parentEnvPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: parentEnvPath })

// Environment validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing required environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Configuration
const CONFIG = {
  SCRUB_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  RETRY_DELAY_MS: 5 * 60 * 1000,     // 5 minutes on error
  MAX_RETRIES: 3,
  SCRUB_CAMPAIGN_NAME: 'all data scrub campaign',
}

// State tracking for nomad dashboard
let agentState = {
  status: 'active' as 'active' | 'paused' | 'error',
  lastScrub: null as string | null,
  totalPriorityLeads: 0,
  consecutiveErrors: 0,
  totalRuns: 0,
}

// Constants
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
  'mail.ru',
  'gmx.com',
  'gmx.net',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'sohu.com',
  'foxmail.com',
])

// Initialize Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// ─── Industry blacklist (duplicated here to avoid ESM/CommonJS issues in standalone script)
const BLACKLISTED_INDUSTRY_TERMS_LP = [
  // Government / public sector
  'government', ' gov ', '.gov', 'govt', 'federal', 'state of ', 'city of ', 'county of ',
  'department of ', 'dept of ', 'office of ', ' department', ' council',
  'county office', 'county clerk', 'county sheriff', ' county',
  'public works', 'public school', 'school district', 'unified school', ' school',
  'municipality', 'municipal', 'township', 'city hall',
  'police department', 'police dept', 'sheriff', 'corrections',
  'veterans affairs', 'social services', 'housing authority',
  'district court', 'port authority', 'transit authority', 'board of education',
  // Non-profit / religious
  'non-profit', 'nonprofit', 'non profit', '501(c)', '501c3', 'charity', 'foundation',
  ' church', 'ministry', 'diocese', 'synagogue', 'mosque', 'temple',
  // Fire / emergency
  'fire department', 'fire dept', 'fire station', 'fire district', 'fire house',
]

const INFERENCE_MAP_LP: Array<{ keywords: string[]; industry: string }> = [
  { keywords: ['construc', 'contractor', 'contracting', 'builder', 'remodel', 'roofing', 'plumbing', 'hvac', 'electrician', 'flooring', 'concrete', 'landscap', 'paving', 'masonry', 'cabinet', 'drywall', 'excavat'], industry: 'Construction' },
  { keywords: ['truck', 'transport', 'freight', 'logistics', 'hauling', 'courier', 'dispatch', 'delivery', 'moving', 'carrier', 'shipping'], industry: 'Transportation/Trucking' },
  { keywords: ['real estate', 'realty', 'realtor', 'properties', 'property mgmt', 'property management', 'homes for sale', 'apartment'], industry: 'Real Estate' },
  { keywords: ['medical', 'clinic', 'dental', 'dentist', 'therapy', 'therapist', 'healthcare', 'chiro', 'optom', 'pharmacy', 'urgent care', 'physical therapy', 'rehab', 'veterinar'], industry: 'Healthcare' },
  { keywords: ['ecommerce', 'e-commerce', 'online store', 'shopify', 'dropship'], industry: 'E-commerce' },
  { keywords: ['restaurant', 'cafe', 'catering', 'bakery', 'diner', 'pizza', 'grill', 'bbq', 'taco', 'food service', 'bistro'], industry: 'Restaurants/Food' },
  { keywords: ['auto repair', 'automotive', 'car wash', 'mechanic', 'tire ', 'body shop', 'collision'], industry: 'Auto/Automotive' },
  { keywords: ['manufactur', 'fabricat', 'machining', 'assembly', 'industrial', 'welding'], industry: 'Manufacturing' },
  { keywords: ['retail', 'boutique', 'shop ', 'outlet', 'supplies'], industry: 'Retail' },
  { keywords: ['consult', 'advisory', 'solutions', 'services', 'group', 'associates', 'partners', 'firm', 'agency', 'staffing', 'marketing', 'accounting', 'cpa', 'attorney', 'law office', 'legal', 'insurance'], industry: 'Professional Services' },
]

function inferIndustryLP(businessName: string | null | undefined): string | null {
  if (!businessName) return null
  const lower = businessName.toLowerCase()
  for (const entry of INFERENCE_MAP_LP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.industry
    }
  }
  return null
}

function isBlacklistedIndustryLP(lead: { industry?: string | null; business_name?: string | null }): boolean {
  const haystack = `${lead.industry ?? ''} ${lead.business_name ?? ''}`.toLowerCase()
  for (const term of BLACKLISTED_INDUSTRY_TERMS_LP) {
    if (haystack.includes(term)) return true
  }
  return false
}

// ─── Fitness tiers ───────────────────────────────────────────────────────────
// Tier 1: High-value industries → upgrade to high_priority
const TIER_1_INDUSTRIES = new Set([
  'Construction', 'Transportation/Trucking', 'Manufacturing', 'E-commerce',
  'Professional Services', 'Real Estate', 'Healthcare', 'Auto/Automotive',
])
// Tier 2: Low-value industries → keep as 'new', do NOT promote to high_priority
const TIER_2_INDUSTRIES = new Set([
  'Retail', 'Restaurants/Food', 'Beauty/Wellness', 'Education/Childcare', 'Religious Organization',
])

// ─── Decision-maker check ────────────────────────────────────────────────────
// If first_name looks like a role/department rather than a real person, skip the lead.
const ROLE_NAMES_LP = new Set([
  'admin', 'administrator', 'contact', 'info', 'information', 'office',
  'manager', 'director', 'sales', 'marketing', 'support', 'service',
  'hr', 'billing', 'accounting', 'reception', 'receptionist',
  'operations', 'general', 'corporate', 'business', 'company',
  'main', 'headquarters', 'hq', 'customer', 'help', 'team', 'staff',
  'dept', 'department', 'division', 'unit', 'branch',
])

function isDecisionMakerLP(lead: { first_name: string | null; last_name?: string | null }): boolean {
  const fn = lead.first_name?.trim()
  if (!fn || fn.length < 2) return false
  const lower = fn.toLowerCase()
  if (ROLE_NAMES_LP.has(lower)) return false
  // Multi-word first names usually indicate a role/department title, not a person
  if (fn.split(/\s+/).length > 2) return false
  return true
}

// Types based on database schema
interface DialerRawLead {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  email: string | null
  business_name: string | null
  notes: string | null
  industry: string | null
  stage: string
  source: string | null
  is_archived: boolean
  promoted_to_crm_lead_id: string | null
}

export interface CrmLead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  business_name: string | null
  stage: string | null
  last_call_outcome: string | null
  is_archived: boolean
  lead_temperature: 'cold' | 'warm' | 'hot' | null
  assigned_to_user_id: string | null
  assigned_to_name: string | null
}

interface CrmTask {
  id: string
  lead_id: string
  title: string
  task_type: string
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  status: 'To Do' | 'In Progress' | 'Waiting' | 'Done'
}

// Utility: Build lead name for task title
function buildLeadName(lead: CrmLead): string {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return fullName || lead.business_name || 'Lead'
}

// HARD GATEKEEPER - STRICT HUMAN CHECK (Non-negotiable)
// Rules:
// 1. MUST have first_name (string, not empty)
// 2. MUST have email (string, not empty)  
// 3. Email MUST contain '@'
// 4. Email MUST NOT be consumer domain (gmail, yahoo, hotmail, outlook, icloud, msn, aol, live)
// 5. first_name MUST NOT contain >3 consecutive digits (4+ digits = REJECT)

const FORBIDDEN_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
  'gmx.com', 'gmx.net', 'qq.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'foxmail.com', 'hey.com', 'fastmail.com'
])

// ULTRA STRICT: Any digit in name = REJECT
const ANY_DIGIT_REGEX = /\d/

// SMS/Junk keywords that indicate automated replies or spam
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'text stop', 'help info', 'auto-confirm',
  'automated message', 'do not reply', 'sms terms',
  'terms and conditions', 'privacy policy', 'carrier rates',
  'msg&data', 'msg & data', 'data rates',
])

function isJunkLead(lead: DialerRawLead): boolean {
  // Check 1: MUST have first_name
  if (!lead.first_name || typeof lead.first_name !== 'string' || lead.first_name.trim() === '') {
    return true // No name = junk
  }
  
  // Check 2: MUST have email
  if (!lead.email || typeof lead.email !== 'string' || lead.email.trim() === '') {
    return true // No email = junk
  }
  
  const firstName = lead.first_name.trim()
  const email = lead.email.trim().toLowerCase()
  
  // Check 3: Email MUST contain '@' AND '.'
  if (!email.includes('@') || !email.includes('.')) {
    return true
  }
  
  // Check 4: MUST NOT be forbidden domain
  const domain = email.split('@')[1]
  if (!domain || FORBIDDEN_DOMAINS.has(domain)) {
    return true
  }
  
  // Check 5: first_name MUST be at least 2 characters
  if (firstName.length < 2) {
    return true
  }
  
  // Check 6: first_name MUST contain NO numbers (any digit = reject)
  if (ANY_DIGIT_REGEX.test(firstName)) {
    return true
  }
  
  // Check 7: No junk keywords anywhere
  const allText = `${firstName} ${lead.last_name || ''} ${email} ${lead.business_name || ''} ${lead.notes || ''}`.toLowerCase()
  const keywordsArray = Array.from(JUNK_KEYWORDS)
  for (const keyword of keywordsArray) {
    if (allText.includes(keyword)) {
      return true
    }
  }

  // Check 8: Blacklisted industry / company name (government, non-profit, etc.)
  if (isBlacklistedIndustryLP(lead)) {
    return true
  }

  return false
}

// Legacy professional email check (now integrated into isJunkLead)
function isProfessionalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  if (FORBIDDEN_DOMAINS.has(domain)) return false
  // Check subdomains
  const forbiddenArray = Array.from(FORBIDDEN_DOMAINS)
  for (const forbidden of forbiddenArray) {
    if (domain === forbidden || domain.endsWith(`.${forbidden}`)) {
      return false
    }
  }
  return true
}

// Action 0: Purge blacklisted/government leads from the scrub campaign
async function purgeGarbageLeads(): Promise<{ purged: number; errors: string[] }> {
  console.log('\n🗑️  Purging garbage leads from scrub campaign...')
  const errors: string[] = []
  let purged = 0

  try {
    const { data: campaign } = await supabase
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', CONFIG.SCRUB_CAMPAIGN_NAME)
      .eq('status', 'active')
      .single()

    if (!campaign) {
      console.log('   No active scrub campaign — skipping purge')
      return { purged: 0, errors }
    }

    // Pull raw leads in the campaign that match garbage company name terms
    const garbageTerms = [
      'fire department', 'fire dept', 'fire station', 'fire district', 'fire house',
      ' county', 'county of ', 'county office', 'county clerk',
      'office of ', ' department', 'dept of ', 'department of ',
      'government', 'municipality', 'municipal', 'city hall', 'city of ',
      'state of ', 'federal ', ' council', 'public works', 'public school',
      'school district', 'police dept', 'police department', 'sheriff',
      'non-profit', 'nonprofit', '501(c)', 'charity', 'foundation',
      ' church', 'transit authority', 'housing authority', 'veterans affairs',
    ]

    // Fetch all campaign lead IDs first
    const { data: clRows } = await supabase
      .from('dialer_campaign_leads')
      .select('id, raw_lead_id')
      .eq('campaign_id', campaign.id)

    if (!clRows || clRows.length === 0) {
      console.log('   Campaign is empty')
      return { purged: 0, errors }
    }

    const rawIds = clRows.map(r => r.raw_lead_id)

    // Fetch raw leads and filter in JS (most reliable cross-DB approach)
    const CHUNK = 200
    const garbage: string[] = [] // raw_lead ids to purge
    for (let i = 0; i < rawIds.length; i += CHUNK) {
      const chunk = rawIds.slice(i, i + CHUNK)
      const { data: raws } = await supabase
        .from('dialer_raw_leads')
        .select('id, business_name, industry')
        .in('id', chunk)
        .eq('is_archived', false)
      if (!raws) continue
      for (const raw of raws) {
        if (isBlacklistedIndustryLP({ industry: raw.industry, business_name: raw.business_name })) {
          garbage.push(raw.id)
        } else {
          // Also check directly against the broader garbage term list
          const haystack = (raw.business_name ?? '').toLowerCase()
          if (garbageTerms.some(t => haystack.includes(t))) {
            garbage.push(raw.id)
          }
        }
      }
    }

    if (garbage.length === 0) {
      console.log('   No garbage leads found in campaign ✓')
      return { purged: 0, errors }
    }

    console.log(`   Found ${garbage.length} garbage leads — archiving...`)

    // Archive raw leads in batches
    for (let i = 0; i < garbage.length; i += 50) {
      const batch = garbage.slice(i, i + 50)
      await supabase.from('dialer_raw_leads').update({
        is_archived: true,
        do_not_call: true,
        stage:       'dnc',
        updated_at:  new Date().toISOString(),
      }).in('id', batch)
    }

    // Remove from campaign
    const garbageSet = new Set(garbage)
    const clIdsToDelete = clRows
      .filter(cl => garbageSet.has(cl.raw_lead_id))
      .map(cl => cl.id)

    for (let i = 0; i < clIdsToDelete.length; i += 50) {
      const batch = clIdsToDelete.slice(i, i + 50)
      await supabase.from('dialer_campaign_leads').delete().in('id', batch)
    }

    purged = garbage.length
    console.log(`   ✓ Purged and archived ${purged} garbage leads`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error in purgeGarbageLeads: ${msg}`)
    console.error('   purgeGarbageLeads error:', msg)
  }

  return { purged, errors }
}

// Action 1: Scrub dialer_raw_leads for professional emails -> high_priority stage
async function scrubDialerLeadsForPriority(): Promise<{
  processed: number
  upgraded: number
  archived: number
  errors: string[]
}> {
  console.log('\n🔍 Scrubbing dialer_raw_leads for professional emails...')
  console.log(`   Target campaign: "${CONFIG.SCRUB_CAMPAIGN_NAME}"`)
  console.log('   🛡️  STRICT MODE: Blacklist + decision-maker + fitness tiers active')

  const errors: string[] = []
  let processed = 0
  let upgraded = 0
  let archived = 0
  let skipped = 0

  try {
    // Find the scrub campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', CONFIG.SCRUB_CAMPAIGN_NAME)
      .eq('status', 'active')
      .single()

    if (campaignError || !campaign) {
      console.log('   Scrub campaign not found or not active, scanning all unarchived leads...')
    }

    // Build query for dialer_raw_leads
    let query = supabase
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, phone, email, business_name, industry, notes, stage, source, is_archived, promoted_to_crm_lead_id')
      .eq('is_archived', false)
      .not('email', 'is', null)
      .neq('stage', 'high_priority') // Skip already flagged
      .is('promoted_to_crm_lead_id', null) // Only raw leads not yet promoted

    // If campaign exists, join with campaign leads
    if (campaign) {
      const { data: campaignLeadIds, error: idsError } = await supabase
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .eq('campaign_id', campaign.id)

      if (!idsError && campaignLeadIds && campaignLeadIds.length > 0) {
        const ids = campaignLeadIds.map(cl => cl.raw_lead_id)
        query = query.in('id', ids)
        console.log(`   Filtering to ${ids.length} leads in scrub campaign`)
      }
    }

    const { data: leads, error } = await query

    if (error) {
      throw new Error(`Failed to fetch dialer leads: ${error.message}`)
    }

    if (!leads || leads.length === 0) {
      console.log('   No scrubbable leads with emails found')
      return { processed: 0, upgraded: 0, errors }
    }

    console.log(`   Found ${leads.length} leads to scrub`)

    for (const lead of leads as DialerRawLead[]) {
      processed++

      if (!lead.email) continue

      // ── Step 1: Blacklisted (gov/non-profit/church) → archive immediately ────
      if (isBlacklistedIndustryLP(lead)) {
        console.log(`   🗑️  BLACKLISTED (archiving): ${lead.business_name || lead.first_name}`)
        await supabase.from('dialer_raw_leads').update({
          is_archived: true,
          do_not_call: true,
          stage:       'dnc',
          updated_at:  new Date().toISOString(),
        }).eq('id', lead.id)
        archived++
        skipped++
        continue
      }

      // ── Step 2: Other junk (SMS, bad email format, etc.) ─────────────────────
      if (isJunkLead(lead)) {
        skipped++
        console.log(`   🗑️  JUNK (skipping): ${lead.first_name} ${lead.last_name || ''}`)
        continue
      }

      // ── Step 3: Decision-maker required — no roles, no departments ───────────
      if (!isDecisionMakerLP(lead)) {
        console.log(`   ⚠️  NO DECISION-MAKER (skipping): "${lead.first_name}" @ ${lead.business_name || 'unknown'}`)
        skipped++
        continue
      }

      if (isProfessionalEmail(lead.email)) {
        // ── Step 4: Infer industry + fitness tier ─────────────────────────────
        const inferredIndustry = lead.industry || inferIndustryLP(lead.business_name)

        if (inferredIndustry && TIER_2_INDUSTRIES.has(inferredIndustry)) {
          // Low-value industry: tag with industry but do NOT promote to high_priority
          console.log(`   ⬇️  TIER 2 (${inferredIndustry}) — keeping as new: ${lead.first_name} ${lead.last_name ?? ''}`)
          if (!lead.industry) {
            await supabase.from('dialer_raw_leads').update({
              industry:   inferredIndustry,
              updated_at: new Date().toISOString(),
            }).eq('id', lead.id)
          }
          skipped++
          continue
        }

        console.log(`   ✓ TIER 1 (${inferredIndustry ?? 'unknown'}): ${lead.email} — ${lead.first_name} ${lead.last_name ?? ''}`)

        // ── Step 5: Upgrade to high_priority ─────────────────────────────────
        const { error: updateError } = await supabase
          .from('dialer_raw_leads')
          .update({
            stage:      'high_priority',
            industry:   inferredIndustry ?? lead.industry ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        if (updateError) {
          errors.push(`Failed to upgrade lead ${lead.id}: ${updateError.message}`)
          continue
        }

        upgraded++
        console.log(`     → Stage updated to high_priority`)

        // Create audit log
        await supabase.from('crm_audit_logs').insert({
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
    
    console.log(`\n   📊 Scrub: ${processed} processed · ${upgraded} upgraded · ${archived} archived (garbage) · ${skipped} skipped`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error in scrubDialerLeadsForPriority: ${message}`)
  }

  return { processed, upgraded, archived, errors }
}

// Action 1: Flag professional emails as High Priority in CRM
async function flagProfessionalEmails(): Promise<{
  processed: number
  flagged: number
  errors: string[]
}> {
  console.log('\n📧 Scanning CRM leads for professional emails...')

  const errors: string[] = []
  let processed = 0
  let flagged = 0

  try {
    // Fetch all visible CRM leads with emails
    const { data: leads, error } = await supabase
      .from('crm_leads')
      .select('id, first_name, last_name, email, business_name, stage, last_call_outcome, is_archived, lead_temperature, assigned_to_user_id, assigned_to_name')
      .eq('is_archived', false)
      .not('email', 'is', null)

    if (error) {
      throw new Error(`Failed to fetch leads: ${error.message}`)
    }

    if (!leads || leads.length === 0) {
      console.log('  No leads with emails found')
      return { processed: 0, flagged: 0, errors }
    }

    console.log(`  Found ${leads.length} leads with emails`)

    // Check each lead for professional email
    for (const lead of leads as CrmLead[]) {
      processed++

      if (!lead.email) continue

      if (isProfessionalEmail(lead.email)) {
        console.log(`  ✓ Professional email detected: ${lead.email} (Lead: ${buildLeadName(lead)})`)

        // Get or create 'High Priority' tag
        const { data: existingTag } = await supabase
          .from('crm_tags')
          .select('id')
          .eq('slug', 'high-priority')
          .is('deleted_at', null)
          .single()

        let tagId: string

        if (existingTag) {
          tagId = existingTag.id
        } else {
          const { data: newTag, error: tagError } = await supabase
            .from('crm_tags')
            .insert({
              name: 'High Priority',
              slug: 'high-priority',
              color: 'red',
              description: 'Automatically flagged for professional email domain',
              created_by_name: 'Lead Processor Agent',
            })
            .select('id')
            .single()

          if (tagError || !newTag) {
            errors.push(`Failed to create tag for lead ${lead.id}: ${tagError?.message}`)
            continue
          }
          tagId = newTag.id
        }

        // Check if tag already linked
        const { data: existingLink } = await supabase
          .from('crm_tag_links')
          .select('id')
          .eq('tag_id', tagId)
          .eq('entity_type', 'lead')
          .eq('entity_id', lead.id)
          .single()

        if (existingLink) {
          console.log(`    Tag already applied to lead ${lead.id}`)
          flagged++
          continue
        }

        // Apply tag to lead
        const { error: linkError } = await supabase
          .from('crm_tag_links')
          .insert({
            tag_id: tagId,
            entity_type: 'lead',
            entity_id: lead.id,
            created_by_name: 'Lead Processor Agent',
          })

        if (linkError) {
          errors.push(`Failed to tag lead ${lead.id}: ${linkError.message}`)
        } else {
          console.log(`    ✓ Tagged as High Priority`)
          flagged++

          // Create audit log
          await supabase.from('crm_audit_logs').insert({
            action_type: 'tag_assigned',
            entity_type: 'lead',
            entity_ids: [lead.id],
            summary: `High Priority tag auto-assigned: Professional email domain`,
            details: {
              email: lead.email,
              domain: lead.email.split('@')[1],
              automated: true,
              source: 'lead-processor-agent',
            },
            performed_by_name: 'Lead Processor Agent',
          })
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error in flagProfessionalEmails: ${message}`)
  }

  return { processed, flagged, errors }
}

// Action 2: Create Follow-Up tasks for Interested leads
async function createFollowUpTasksForInterested(): Promise<{
  processed: number
  tasksCreated: number
  errors: string[]
}> {
  console.log('\n🎯 Creating follow-up tasks for Interested leads...')

  const errors: string[] = []
  let processed = 0
  let tasksCreated = 0

  try {
    // Fetch leads marked as 'interested' without an existing follow-up task
    const { data: leads, error } = await supabase
      .from('crm_leads')
      .select('id, first_name, last_name, email, business_name, stage, last_call_outcome, is_archived, lead_temperature, assigned_to_user_id, assigned_to_name, callback_due_at, follow_up_at')
      .eq('is_archived', false)
      .or('stage.eq.interested,last_call_outcome.eq.Interested')

    if (error) {
      throw new Error(`Failed to fetch interested leads: ${error.message}`)
    }

    if (!leads || leads.length === 0) {
      console.log('  No interested leads found')
      return { processed: 0, tasksCreated: 0, errors }
    }

    console.log(`  Found ${leads.length} interested leads`)

    for (const lead of leads as (CrmLead & { callback_due_at: string | null; follow_up_at: string | null })[]) {
      processed++

      const leadName = buildLeadName(lead)

      // Check if there's already a pending follow-up task for this lead
      const { data: existingTasks, error: checkError } = await supabase
        .from('crm_tasks')
        .select('id')
        .eq('lead_id', lead.id)
        .in('task_type', ['Follow-Up', 'Callback'])
        .in('status', ['To Do', 'In Progress'])
        .is('deleted_at', null)
        .limit(1)

      if (checkError) {
        errors.push(`Failed to check existing tasks for lead ${lead.id}: ${checkError.message}`)
        continue
      }

      if (existingTasks && existingTasks.length > 0) {
        console.log(`  ℹ Lead ${lead.id} (${leadName}) already has pending follow-up task`)
        continue
      }

      // Determine due date (use follow_up_at, callback_due_at, or default to tomorrow)
      const now = new Date()
      let dueAt: string

      if (lead.follow_up_at) {
        dueAt = lead.follow_up_at
      } else if (lead.callback_due_at) {
        dueAt = lead.callback_due_at
      } else {
        // Default to tomorrow at 9 AM
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        dueAt = tomorrow.toISOString()
      }

      // Create follow-up task
      const { data: task, error: taskError } = await supabase
        .from('crm_tasks')
        .insert({
          lead_id: lead.id,
          title: `Follow up with ${leadName}`,
          description: `Lead expressed interest. ${lead.email ? `Email: ${lead.email}` : ''} ${lead.business_name ? `Business: ${lead.business_name}` : ''}`.trim(),
          task_type: 'Follow-Up',
          priority: 'High',
          status: 'To Do',
          due_at: dueAt,
          owner_user_id: lead.assigned_to_user_id,
          owner_name: lead.assigned_to_name || 'Unassigned',
          pipeline_stage: lead.stage ?? 'interested',
          created_source: 'automation',
          created_source_label: 'Lead Processor Agent',
          source_metadata: {
            trigger: 'interested_lead',
            lead_stage: lead.stage,
            lead_outcome: lead.last_call_outcome,
            automated: true,
          },
        })
        .select('id')
        .single()

      if (taskError) {
        errors.push(`Failed to create task for lead ${lead.id}: ${taskError.message}`)
      } else {
        console.log(`  ✓ Created follow-up task for ${leadName} (Due: ${new Date(dueAt).toLocaleDateString()})`)
        tasksCreated++

        // Create audit log
        await supabase.from('crm_audit_logs').insert({
          action_type: 'task_created',
          entity_type: 'lead',
          entity_ids: [lead.id],
          summary: `Follow-Up task auto-created for interested lead`,
          details: {
            task_id: task?.id,
            task_type: 'Follow-Up',
            due_at: dueAt,
            automated: true,
            source: 'lead-processor-agent',
          },
          performed_by_name: 'Lead Processor Agent',
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error in createFollowUpTasksForInterested: ${message}`)
  }

  return { processed, tasksCreated, errors }
}

// ─── Backfill threshold ─────────────────────────────────────────────────────
const BACKFILL_THRESHOLD = 20 // if fresh queue drops below this, add more leads

// Action: Backfill campaign with fresh high_priority leads when queue runs low
async function backfillFreshLeads(): Promise<{ backfilled: number; errors: string[] }> {
  console.log('\n🔄 Checking campaign queue depth for backfill...')
  const errors: string[] = []
  let backfilled = 0

  try {
    const { data: campaign } = await supabase
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', CONFIG.SCRUB_CAMPAIGN_NAME)
      .eq('status', 'active')
      .single()

    if (!campaign) {
      console.log('   No active scrub campaign — skipping backfill')
      return { backfilled: 0, errors }
    }

    // Count truly fresh leads in campaign: status=new and never called
    const { count: freshCount, error: countErr } = await supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'new')
      .is('last_called_at', null)

    if (countErr) {
      errors.push(`Failed to count fresh leads: ${countErr.message}`)
      return { backfilled: 0, errors }
    }

    const fresh = freshCount ?? 0
    console.log(`   Fresh (never-called) leads in queue: ${fresh}`)

    if (fresh >= BACKFILL_THRESHOLD) {
      console.log(`   Queue healthy (≥${BACKFILL_THRESHOLD}) — no backfill needed`)
      return { backfilled: 0, errors }
    }

    const needed = BACKFILL_THRESHOLD - fresh
    console.log(`   Queue low — seeking ${needed} fresh high_priority leads...`)

    // Get raw_lead_ids already in the campaign (to avoid duplicates)
    const { data: existingRows } = await supabase
      .from('dialer_campaign_leads')
      .select('raw_lead_id')
      .eq('campaign_id', campaign.id)

    const existingSet = new Set((existingRows ?? []).map(r => r.raw_lead_id))

    // Find high_priority raw leads not yet in the campaign
    const { data: candidates, error: fetchErr } = await supabase
      .from('dialer_raw_leads')
      .select('id')
      .eq('stage', 'high_priority')
      .eq('is_archived', false)
      .eq('do_not_call', false)
      .is('promoted_to_crm_lead_id', null)
      .is('last_call_at', null)      // only truly fresh (never called globally)
      .order('created_at', { ascending: true }) // oldest first
      .limit(needed + 50)            // fetch extra to account for already-in-campaign ones

    if (fetchErr) {
      errors.push(`Failed to fetch backfill candidates: ${fetchErr.message}`)
      return { backfilled: 0, errors }
    }

    const toAdd = (candidates ?? [])
      .filter(l => !existingSet.has(l.id))
      .slice(0, needed)

    if (toAdd.length === 0) {
      console.log('   No new high_priority leads available for backfill — run scrub first')
      return { backfilled: 0, errors }
    }

    // Determine max sort_order in campaign to append after existing leads
    const { data: maxRow } = await supabase
      .from('dialer_campaign_leads')
      .select('sort_order')
      .eq('campaign_id', campaign.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()
    const baseSort = (maxRow?.sort_order ?? 0) + 1

    const rows = toAdd.map((l, i) => ({
      campaign_id: campaign.id,
      raw_lead_id: l.id,
      sort_order:  baseSort + i,
    }))

    const { error: insertErr } = await supabase
      .from('dialer_campaign_leads')
      .upsert(rows, { onConflict: 'campaign_id,raw_lead_id', ignoreDuplicates: true })

    if (insertErr) {
      errors.push(`Backfill insert failed: ${insertErr.message}`)
    } else {
      backfilled = toAdd.length
      console.log(`   ✓ Backfilled ${backfilled} fresh high_priority leads into campaign`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Fatal error in backfillFreshLeads: ${msg}`)
    console.error('   backfillFreshLeads error:', msg)
  }

  return { backfilled, errors }
}

// Single run execution (one cycle)
async function runOnce(): Promise<boolean> {
  const startTime = Date.now()
  const allErrors: string[] = []

  try {
    // Test database connection
    const { error: pingError } = await supabase.from('crm_leads').select('count', { count: 'exact', head: true })
    if (pingError) {
      throw new Error(`Database connection failed: ${pingError.message}`)
    }

    // Execute actions
    const purgeResult = await purgeGarbageLeads()
    allErrors.push(...purgeResult.errors)

    const scrubResult = await scrubDialerLeadsForPriority()
    allErrors.push(...scrubResult.errors)

    // Backfill campaign with fresh leads if queue runs low (runs after scrub promotes leads)
    const backfillResult = await backfillFreshLeads()
    allErrors.push(...backfillResult.errors)

    const flagResult = await flagProfessionalEmails()
    allErrors.push(...flagResult.errors)

    const taskResult = await createFollowUpTasksForInterested()
    allErrors.push(...taskResult.errors)

    // Update state
    agentState.lastScrub = new Date().toISOString()
    agentState.totalRuns++
    agentState.totalPriorityLeads += scrubResult.upgraded
    agentState.consecutiveErrors = 0
    agentState.status = 'active'

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log(`  RUN #${agentState.totalRuns} COMPLETE · ${duration}s`)
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Garbage purge: ${purgeResult.purged} archived`)
    console.log(`  Dialer scrub: ${scrubResult.upgraded}/${scrubResult.processed} upgraded · ${scrubResult.archived} archived`)
    console.log(`  Backfill:     ${backfillResult.backfilled} fresh leads added to campaign`)
    console.log(`  CRM tags: ${flagResult.flagged}/${flagResult.processed} flagged`)
    console.log(`  Tasks: ${taskResult.tasksCreated}/${taskResult.processed} created`)

    if (allErrors.length > 0) {
      console.log(`  ⚠ Errors: ${allErrors.length}`)
    }

    console.log(`  Next run: ${new Date(Date.now() + CONFIG.SCRUB_INTERVAL_MS).toLocaleTimeString()}`)
    console.log('═══════════════════════════════════════════════════════════')

    return allErrors.length === 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ RUN ERROR: ${message}`)
    agentState.consecutiveErrors++
    agentState.status = agentState.consecutiveErrors >= CONFIG.MAX_RETRIES ? 'error' : 'paused'
    return false
  }
}

// Main always-on loop with restart logic
async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║   SourcifyLending ALWAYS-ON Lead Processor Agent          ║')
  console.log('║   Digital Nomad Workflow · 24/7 Operation                ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log(`  Started: ${new Date().toISOString()}`)
  console.log(`  Database: ${SUPABASE_URL}`)
  console.log(`  Interval: ${CONFIG.SCRUB_INTERVAL_MS / 60000} minutes`)
  console.log('───────────────────────────────────────────────────────────')

  // Handle graceful shutdown
  let shutdownRequested = false
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutdown requested, completing current cycle...')
    shutdownRequested = true
  })
  process.on('SIGTERM', () => {
    console.log('\n\n👋 Shutdown requested, completing current cycle...')
    shutdownRequested = true
  })

  // Main loop
  while (!shutdownRequested) {
    const success = await runOnce()

    if (shutdownRequested) break

    // Calculate delay (shorter on error, normal on success)
    const delayMs = success
      ? CONFIG.SCRUB_INTERVAL_MS
      : Math.min(
          CONFIG.RETRY_DELAY_MS * Math.pow(2, agentState.consecutiveErrors - 1),
          CONFIG.SCRUB_INTERVAL_MS
        )

    if (!success && agentState.consecutiveErrors >= CONFIG.MAX_RETRIES) {
      console.error(`\n💥 MAX RETRIES (${CONFIG.MAX_RETRIES}) REACHED - PAUSING`)
      console.error('   Check database connection and restart manually')
      agentState.status = 'error'
      // Keep looping but with longer intervals
    }

    console.log(`\n⏳ Sleeping for ${(delayMs / 60000).toFixed(1)} minutes...`)

    // Sleep with interrupt check
    const sleepStart = Date.now()
    while (!shutdownRequested && Date.now() - sleepStart < delayMs) {
      await new Promise(r => setTimeout(r, 1000)) // Check every second
    }
  }

  console.log('\n✅ Agent shut down gracefully')
  console.log(`   Total runs: ${agentState.totalRuns}`)
  console.log(`   Final status: ${agentState.status}`)
  process.exit(0)
}

// LOCAL EXECUTION DISABLED - Agent now runs via Vercel Cron
// Cron schedule: */30 * * * * (every 30 minutes)
// Endpoint: /api/admin/dialer/agent-run
// 
// To run locally for testing only, uncomment below:
// if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
//   main().catch((err) => {
//     console.error('\n💥 UNHANDLED FATAL ERROR:', err)
//     process.exit(1)
//   })
// }

export {
  scrubDialerLeadsForPriority,
  flagProfessionalEmails,
  createFollowUpTasksForInterested,
  isProfessionalEmail,
  buildLeadName,
  agentState,
  CONFIG,
}
