#!/usr/bin/env tsx
/**
 * RE-SCAN: Process next 200 leads with strict junk detection
 * 
 * - Skips leads with >5 consecutive digits in first_name
 * - Skips leads with SMS/junk keywords
 * - Upgrades valid professional emails to high_priority
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

// SMS/Junk keywords
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'text stop', 'help info', 'auto-confirm',
  'automated message', 'do not reply', 'sms terms',
  'terms and conditions', 'privacy policy', 'carrier rates',
  'msg&data', 'msg & data', 'data rates',
])

// STRICT: More than 5 consecutive digits = junk (6+)
const DIGIT_SEQUENCE_REGEX = /\d{6,}/

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

function isJunkLead(lead: { first_name?: string | null; last_name?: string | null; email?: string | null; business_name?: string | null; notes?: string | null }): boolean {
  if (!lead.first_name) return true // No name = junk
  
  // Check for >5 consecutive digits in first_name
  if (DIGIT_SEQUENCE_REGEX.test(lead.first_name)) return true
  
  // Check for junk keywords anywhere
  const allText = [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.business_name,
    lead.notes,
  ].filter(Boolean).join(' ').toLowerCase()
  
  for (const keyword of JUNK_KEYWORDS) {
    if (allText.includes(keyword)) return true
  }
  
  return false
}

async function rescan200Leads(): Promise<{ processed: number; upgraded: number; skipped: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  RE-SCAN: Next 200 Leads (with STRICT junk detection)')
  console.log('═══════════════════════════════════════════════════════════\n')

  let processed = 0
  let upgraded = 0
  let skipped = 0

  try {
    // Find scrub campaign
    const { data: campaign } = await supabase
      .from('dialer_campaigns')
      .select('id')
      .ilike('name', 'all data scrub campaign')
      .eq('status', 'active')
      .single()

    let leads: any[] = []

    // Get leads from campaign or general pool
    if (campaign) {
      const { data: campaignLeadIds } = await supabase
        .from('dialer_campaign_leads')
        .select('raw_lead_id')
        .eq('campaign_id', campaign.id)
        .limit(500)

      if (campaignLeadIds && campaignLeadIds.length > 0) {
        const allIds = campaignLeadIds.map(cl => cl.raw_lead_id)
        
        // Fetch in batches of 100 to avoid URL limits
        for (let i = 0; i < allIds.length && leads.length < 200; i += 100) {
          const batch = allIds.slice(i, i + 100)
          const { data } = await supabase
            .from('dialer_raw_leads')
            .select('id, first_name, last_name, email, business_name, stage, source, notes, promoted_to_crm_lead_id')
            .in('id', batch)
            .eq('is_archived', false)
            .not('email', 'is', null)
            .neq('stage', 'high_priority')
            .is('promoted_to_crm_lead_id', null)
          if (data) leads.push(...data)
        }
      }
    } else {
      // Fallback: general pool
      const { data } = await supabase
        .from('dialer_raw_leads')
        .select('id, first_name, last_name, email, business_name, stage, source, notes, promoted_to_crm_lead_id')
        .eq('is_archived', false)
        .not('email', 'is', null)
        .neq('stage', 'high_priority')
        .is('promoted_to_crm_lead_id', null)
        .limit(200)
      leads = data || []
    }

    // Limit to 200
    leads = leads.slice(0, 200)

    if (leads.length === 0) {
      console.log('✅ No leads to process')
      return { processed: 0, upgraded: 0, skipped: 0 }
    }

    console.log(`🔍 Processing ${leads.length} leads...\n`)

    for (const lead of leads) {
      processed++

      // STRICT: Skip junk leads immediately
      if (isJunkLead(lead)) {
        skipped++
        console.log(`  🗑️  SKIP (junk): ${lead.first_name || 'NO_NAME'}`)
        continue
      }

      if (!lead.email || !isProfessionalEmail(lead.email)) {
        continue
      }

      console.log(`  ✓ UPGRADE: ${lead.first_name} ${lead.last_name || ''} <${lead.email}>`)

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
      console.log(`     → high_priority (${upgraded} total)`)

      // Audit log
      await supabase.from('crm_audit_logs').insert({
        action_type: 'stage_updated',
        entity_type: 'lead',
        entity_ids: [lead.id],
        summary: 'Re-scan: Lead upgraded to High Priority',
        details: {
          email: lead.email,
          domain: lead.email.split('@')[1],
          previous_stage: lead.stage,
          new_stage: 'high_priority',
          batch: 'rescan-200',
          source: 'lead-processor-rescan',
        },
        performed_by_name: 'Lead Processor Re-scan',
      })
    }

    // Get final count
    const { count: totalPriority } = await supabase
      .from('dialer_raw_leads')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  RE-SCAN COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Processed: ${processed}`)
    console.log(`  Skipped (junk): ${skipped}`)
    console.log(`  Upgraded: ${upgraded}`)
    console.log(`  ─────────────────────────────────────────────────────────`)
    console.log(`  🎯 TOTAL HIGH PRIORITY LEADS: ${totalPriority ?? 0}`)
    console.log('═══════════════════════════════════════════════════════════')

    return { processed, upgraded, skipped }

  } catch (err) {
    console.error('\n💥 ERROR:', err)
    process.exit(1)
  }
}

rescan200Leads().then(() => process.exit(0))
