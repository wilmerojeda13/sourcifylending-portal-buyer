#!/usr/bin/env tsx
/**
 * ULTRA STRICT PURGE & RESCAN - NO JUNK ALLOWED
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// STRICT: Consumer email patterns
const FORBIDDEN_PATTERNS = [
  '@gmail', '@yahoo', '@hotmail', '@outlook', '@icloud', 
  '@aol', '@msn', '@live', '@protonmail', '@zoho'
]

function ultraStrictCheck(lead: { first_name?: string | null; email?: string | null }): { pass: boolean; reason?: string } {
  // Check 1: MUST have email
  if (!lead.email || typeof lead.email !== 'string') {
    return { pass: false, reason: 'NO_EMAIL' }
  }
  
  const email = lead.email.trim()
  
  // Check 2: Email MUST contain '@' AND '.'
  if (!email.includes('@') || !email.includes('.')) {
    return { pass: false, reason: 'INVALID_EMAIL_FORMAT' }
  }
  
  // Check 3: MUST NOT be consumer domain
  const emailLower = email.toLowerCase()
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (emailLower.includes(pattern)) {
      return { pass: false, reason: `CONSUMER_DOMAIN: ${pattern}` }
    }
  }
  
  // Check 4: MUST have first_name
  if (!lead.first_name || typeof lead.first_name !== 'string') {
    return { pass: false, reason: 'NO_FIRST_NAME' }
  }
  
  const firstName = lead.first_name.trim()
  
  // Check 5: first_name MUST be at least 2 characters
  if (firstName.length < 2) {
    return { pass: false, reason: 'NAME_TOO_SHORT' }
  }
  
  // Check 6: first_name MUST contain NO numbers
  if (/\d/.test(firstName)) {
    return { pass: false, reason: 'NAME_HAS_NUMBERS' }
  }
  
  return { pass: true }
}

async function purgeAll() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  ULTRA STRICT PURGE: Reset ALL high_priority to new')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const { data: leads, error } = await sb
    .from('dialer_raw_leads')
    .select('id, first_name, email')
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
  
  if (error || !leads || leads.length === 0) {
    console.log('No high_priority leads to purge')
    return
  }
  
  console.log(`Purging ${leads.length} leads...\n`)
  
  for (const lead of leads) {
    await sb
      .from('dialer_raw_leads')
      .update({ stage: 'new', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
  }
  
  console.log(`✅ Purged ${leads.length} leads\n`)
}

async function ultraStrictRescan(): Promise<{ upgraded: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  ULTRA STRICT RESCAN: Finding 50 QUALITY leads')
  console.log('  Rules: @ + . in email, NO consumer domains, name ≥2 chars, NO numbers')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  let upgraded = 0
  let processed = 0
  
  // Get leads in batches until we find 50 quality ones
  let offset = 0
  const batchSize = 100
  
  while (upgraded < 50) {
    const { data: leads, error } = await sb
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, email, business_name, stage')
      .eq('is_archived', false)
      .is('promoted_to_crm_lead_id', null)
      .neq('stage', 'high_priority')
      .range(offset, offset + batchSize - 1)
    
    if (error || !leads || leads.length === 0) {
      console.log('No more leads to process')
      break
    }
    
    for (const lead of leads) {
      processed++
      
      const check = ultraStrictCheck(lead)
      
      if (!check.pass) {
        continue
      }
      
      // PASSED all checks
      upgraded++
      console.log(`✅ UPGRADE #${upgraded}: ${lead.first_name} <${lead.email}>`)
      
      await sb
        .from('dialer_raw_leads')
        .update({ stage: 'high_priority', updated_at: new Date().toISOString() })
        .eq('id', lead.id)
      
      if (upgraded >= 50) break
    }
    
    offset += batchSize
    process.stdout.write(`  Processed ${processed}, found ${upgraded} quality leads...\r`)
  }
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ULTRA STRICT RESCAN COMPLETE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total processed: ${processed}`)
  console.log(`  Quality leads found: ${upgraded}`)
  console.log('═══════════════════════════════════════════════════════════')
  
  return { upgraded }
}

async function main() {
  await purgeAll()
  const result = await ultraStrictRescan()
  console.log(`\n🎯 ${result.upgraded} REAL business owners ready to call`)
  process.exit(0)
}

main()
