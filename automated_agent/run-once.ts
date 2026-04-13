#!/usr/bin/env tsx
/**
 * One-time execution: Process first 500 leads in 'all data scrub campaign'
 * Updates stage to 'high_priority' for professional email domains
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local from parent directory
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Consumer domains to exclude
const CONSUMER_DOMAINS = new Set([
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
  const digitRuns = value.match(new RegExp(`\\d{${maxDigits + 1},}`, 'g'))
  return !!digitRuns && digitRuns.length > 0
}

// Check for junk keywords in any text field
function containsJunkKeywords(value: string | null): boolean {
  if (!value) return false
  const lowerValue = value.toLowerCase()
  return Array.from(JUNK_KEYWORDS).some(keyword => lowerValue.includes(keyword))
}

// Check if a lead appears to be junk/SMS garbage
function isJunkLead(lead: { first_name?: string | null; last_name?: string | null; email?: string | null; business_name?: string | null; notes?: string | null }): boolean {
  const allText = [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.business_name,
    lead.notes,
  ].filter(Boolean).join(' ')

  // Check for long digit sequences in name or email
  if (hasLongDigitSequence(lead.first_name ?? null, 4)) return true
  if (hasLongDigitSequence(lead.email ?? null, 4)) return true

  // Check for junk keywords anywhere
  if (containsJunkKeywords(allText)) return true

  return false
}

function isProfessionalEmail(email: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  if (CONSUMER_DOMAINS.has(domain)) return false
  const consumerArray = Array.from(CONSUMER_DOMAINS)
  for (const cd of consumerArray) {
    if (domain === cd || domain.endsWith(`.${cd}`)) return false
  }
  return true
}

// Process leads in batches to avoid URL length limits
const BATCH_SIZE = 100

async function fetchLeadsInBatches(allIds: string[]): Promise<any[]> {
  const allLeads: any[] = []
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, email, business_name, stage, promoted_to_crm_lead_id')
      .in('id', batch)
      .eq('is_archived', false)
      .not('email', 'is', null)
      .neq('stage', 'high_priority')
      .is('promoted_to_crm_lead_id', null)
    if (error) throw error
    if (data) allLeads.push(...data)
  }
  return allLeads
}

async function processFirst500(): Promise<{ processed: number; upgraded: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  ONE-TIME SCRUB: First 500 Leads')
  console.log('  Campaign: "all data scrub campaign"')
  console.log('  Target: Professional emails → high_priority')
  console.log('═══════════════════════════════════════════════════════════\n')

  let processed = 0
  let upgraded = 0

  try {
    // Find scrub campaign
    const { data: campaign } = await supabase
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', 'all data scrub campaign')
      .eq('status', 'active')
      .single()

    if (!campaign) {
      console.log('⚠️  Scrub campaign not found or not active')
      console.log('   Falling back to all unarchived raw leads\n')
    }

    let leads: any[] = []

    // Get leads - either from campaign or general pool
    if (campaign) {
      const { data: campaignLeadIds } = await supabase
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .eq('campaign_id', campaign.id)
        .limit(500)

      if (campaignLeadIds && campaignLeadIds.length > 0) {
        const ids = campaignLeadIds.slice(0, 500).map(cl => cl.raw_lead_id)
        console.log(`📋 Found ${ids.length} leads in scrub campaign\n`)
        leads = await fetchLeadsInBatches(ids)
      }
    } else {
      // Fallback: just get first 500 eligible raw leads
      const { data } = await supabase
        .from('dialer_raw_leads')
        .select('id, first_name, last_name, email, business_name, stage, promoted_to_crm_lead_id')
        .eq('is_archived', false)
        .not('email', 'is', null)
        .neq('stage', 'high_priority')
        .is('promoted_to_crm_lead_id', null)
        .limit(500)
      leads = data || []
    }

    if (leads.length === 0) {
      console.log('✅ No leads to process')
      return { processed: 0, upgraded: 0 }
    }

    console.log(`🔍 Processing ${leads.length} leads in batches of ${BATCH_SIZE}...\n`)

    for (const lead of leads) {
      processed++

      // Skip junk/SMS leads
      if (isJunkLead(lead)) {
        console.log(`  🗑️  SKIP (junk): ${lead.first_name} ${lead.last_name ?? ''}`)
        continue
      }

      if (!lead.email || !isProfessionalEmail(lead.email)) {
        if (processed % 50 === 0) {
          process.stdout.write(`  Checked ${processed}...\r`)
        }
        continue
      }

      console.log(`  ✓ ${lead.first_name} ${lead.last_name ?? ''} <${lead.email}>`)

      const { error: updateError } = await supabase
        .from('dialer_raw_leads')
        .update({
          stage: 'high_priority',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)

      if (updateError) {
        console.log(`     ❌ Failed: ${updateError.message}`)
        continue
      }

      upgraded++
      console.log(`     → Updated to 'high_priority' (${upgraded} total)`)

      // Audit log
      await supabase.from('crm_audit_logs').insert({
        action_type: 'stage_updated',
        entity_type: 'lead',
        entity_ids: [lead.id],
        summary: 'One-time scrub: Lead upgraded to High Priority',
        details: {
          email: lead.email,
          domain: lead.email.split('@')[1],
          previous_stage: lead.stage,
          new_stage: 'high_priority',
          source: 'manual-lead-processor',
          batch: 'first-500',
        },
        performed_by_name: 'Lead Processor Agent (Manual)',
      })
    }

    // Get final count
    const { count: totalPriority } = await supabase
      .from('dialer_raw_leads')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Processed: ${processed} leads`)
    console.log(`  Upgraded:  ${upgraded} to 'high_priority'`)
    console.log(`  ─────────────────────────────────────────────────────────`)
    console.log(`  🎯 TOTAL HIGH PRIORITY LEADS READY: ${totalPriority ?? 0}`)
    console.log('═══════════════════════════════════════════════════════════')

    return { processed, upgraded }

  } catch (err) {
    console.error('\n💥 ERROR:', err)
    process.exit(1)
  }
}

processFirst500().then(() => process.exit(0))
