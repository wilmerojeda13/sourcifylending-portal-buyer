#!/usr/bin/env tsx
/**
 * HARD GATEKEEPER - STRICT HUMAN CHECK
 * 
 * RULES (Non-negotiable):
 * 1. MUST have first_name (string, not empty)
 * 2. MUST have email (string, not empty)
 * 3. Email MUST contain '@'
 * 4. Email MUST NOT end in: @gmail.com, @yahoo.com, @hotmail.com, @outlook.com, @icloud.com, @msn.com, @aol.com, @live.com
 * 5. first_name MUST NOT contain >3 consecutive digits (4+ digits = REJECT)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// STRICT: These domains are FORBIDDEN
const FORBIDDEN_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
  'gmx.com', 'gmx.net', 'qq.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'foxmail.com', 'hey.com', 'fastmail.com'
])

// STRICT: 4+ consecutive digits = REJECT
const JUNK_DIGIT_REGEX = /\d{4,}/

function strictHumanCheck(lead: { first_name?: string | null; email?: string | null }): { pass: boolean; reason?: string } {
  // Check 1: MUST have first_name
  if (!lead.first_name || typeof lead.first_name !== 'string' || lead.first_name.trim() === '') {
    return { pass: false, reason: 'NO_FIRST_NAME' }
  }
  
  // Check 2: MUST have email
  if (!lead.email || typeof lead.email !== 'string' || lead.email.trim() === '') {
    return { pass: false, reason: 'NO_EMAIL' }
  }
  
  const firstName = lead.first_name.trim()
  const email = lead.email.trim().toLowerCase()
  
  // Check 3: Email MUST contain '@'
  if (!email.includes('@')) {
    return { pass: false, reason: 'NO_AT_SYMBOL' }
  }
  
  // Check 4: MUST NOT be forbidden domain
  const domain = email.split('@')[1]
  if (!domain) {
    return { pass: false, reason: 'INVALID_DOMAIN' }
  }
  
  if (FORBIDDEN_DOMAINS.has(domain)) {
    return { pass: false, reason: `FORBIDDEN_DOMAIN: ${domain}` }
  }
  
  // Check 5: first_name MUST NOT have 4+ consecutive digits
  if (JUNK_DIGIT_REGEX.test(firstName)) {
    return { pass: false, reason: 'JUNK_DIGITS_IN_NAME' }
  }
  
  return { pass: true }
}

async function purgeAllHighPriority() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  HARD PURGE: Resetting ALL high_priority to new')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const { data: leads, error } = await sb
    .from('dialer_raw_leads')
    .select('id, first_name, email, stage')
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
  
  if (error) {
    console.error('Error:', error)
    return 0
  }
  
  if (!leads || leads.length === 0) {
    console.log('No high_priority leads to purge')
    return 0
  }
  
  console.log(`Purging ${leads.length} leads...\n`)
  
  let purged = 0
  for (const lead of leads) {
    const { error: updateError } = await sb
      .from('dialer_raw_leads')
      .update({ stage: 'new', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    
    if (!updateError) {
      purged++
    }
  }
  
  console.log(`✅ Purged ${purged} leads to 'new'\n`)
  return purged
}

async function strictRescan500(): Promise<{ processed: number; upgraded: number; rejected: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  HARD GATEKEEPER: Re-scanning 500 leads')
  console.log('  Rules: Name + Email + @ symbol + NO consumer domains + NO 4+ digit names')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  let processed = 0
  let upgraded = 0
  let rejected = 0
  
  // Get 500 unprocessed leads
  const { data: leads, error } = await sb
    .from('dialer_raw_leads')
    .select('id, first_name, last_name, email, business_name, stage, source, is_archived, promoted_to_crm_lead_id')
    .eq('is_archived', false)
    .is('promoted_to_crm_lead_id', null)
    .neq('stage', 'high_priority')
    .limit(500)
  
  if (error) {
    console.error('Error fetching leads:', error)
    return { processed: 0, upgraded: 0, rejected: 0 }
  }
  
  if (!leads || leads.length === 0) {
    console.log('No leads to process')
    return { processed: 0, upgraded: 0, rejected: 0 }
  }
  
  console.log(`Processing ${leads.length} leads with STRICT gatekeeper...\n`)
  
  for (const lead of leads) {
    processed++
    
    const check = strictHumanCheck(lead)
    
    if (!check.pass) {
      rejected++
      console.log(`  ❌ REJECT: ${lead.first_name || 'NO_NAME'} - ${check.reason}`)
      continue
    }
    
    // PASSED - upgrade to high_priority
    upgraded++
    console.log(`  ✅ UPGRADE #${upgraded}: ${lead.first_name} <${lead.email}>`)
    
    await sb
      .from('dialer_raw_leads')
      .update({ stage: 'high_priority', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  HARD GATEKEEPER COMPLETE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Processed: ${processed}`)
  console.log(`  Rejected: ${rejected}`)
  console.log(`  Upgraded (VALID): ${upgraded}`)
  console.log('═══════════════════════════════════════════════════════════')
  
  return { processed, upgraded, rejected }
}

async function main() {
  // Step 1: PURGE ALL
  await purgeAllHighPriority()
  
  // Step 2: STRICT RE-SCAN
  const result = await strictRescan500()
  
  console.log(`\n🎯 RESULT: ${result.upgraded} REAL business owners ready to call`)
  process.exit(0)
}

main()
