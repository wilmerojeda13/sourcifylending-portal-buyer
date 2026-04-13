#!/usr/bin/env tsx
/**
 * STRICT RE-SCRUB: Fix broken High Priority filtering
 * 
 * STRICT RULES:
 * 1. MUST have '@' symbol and NOT be null/empty
 * 2. MUST NOT be consumer domains: gmail, yahoo, hotmail, outlook, icloud, msn, aol
 * 3. first_name MUST NOT have >4 consecutive digits (5+ = junk)
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
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// STRICT: Only these consumer domains are blocked
const BLOCKED_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com',
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
  'gmx.com', 'gmx.net', 'qq.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'foxmail.com',
])

// STRICT: >4 consecutive digits in first_name = junk (5+ digits)
const DIGIT_SEQUENCE_REGEX = /\d{5,}/

// STRICT: Check if email is valid and professional
function isValidProfessionalEmail(email: string | null): boolean {
  // MUST have @ symbol and not be null/empty
  if (!email || typeof email !== 'string') {
    console.log(`     ❌ REJECT: No email`)
    return false
  }
  
  email = email.trim().toLowerCase()
  
  if (!email.includes('@')) {
    console.log(`     ❌ REJECT: No @ symbol: ${email}`)
    return false
  }
  
  const parts = email.split('@')
  if (parts.length !== 2) {
    console.log(`     ❌ REJECT: Invalid email format: ${email}`)
    return false
  }
  
  const domain = parts[1]
  
  // MUST NOT be consumer domain
  if (BLOCKED_DOMAINS.has(domain)) {
    console.log(`     ❌ REJECT: Consumer domain: ${domain}`)
    return false
  }
  
  return true
}

// STRICT: Check first_name for junk digits
function hasJunkDigits(firstName: string | null): boolean {
  if (!firstName || typeof firstName !== 'string') return true // No name = junk
  return DIGIT_SEQUENCE_REGEX.test(firstName)
}

async function strictRescrub(): Promise<{ processed: number; valid: number; rejected: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  STRICT RE-SCRUB: Fix High Priority Queue')
  console.log('  Rules: @ symbol required, NO consumer domains, NO 5+ digit names')
  console.log('═══════════════════════════════════════════════════════════\n')

  let processed = 0
  let valid = 0
  let rejected = 0

  try {
    // Get ALL leads that were previously marked high_priority
    const { data: leads, error } = await supabase
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, email, stage, source, is_archived, promoted_to_crm_lead_id')
      .eq('is_archived', false)
      .is('promoted_to_crm_lead_id', null)

    if (error) throw error
    if (!leads || leads.length === 0) {
      console.log('No leads found')
      return { processed: 0, valid: 0, rejected: 0 }
    }

    console.log(`🔍 Processing ${leads.length} leads with STRICT validation...\n`)

    for (const lead of leads) {
      processed++

      // STRICT VALIDATION
      const rejectReasons: string[] = []
      
      // 1. Check email exists and has @
      if (!lead.email || !lead.email.includes('@')) {
        rejectReasons.push('No @ in email')
      }
      
      // 2. Check for junk digits in name (>4 consecutive)
      if (hasJunkDigits(lead.first_name)) {
        rejectReasons.push('Name has 5+ digits')
      }
      
      // 3. Check consumer domain
      if (lead.email && !isValidProfessionalEmail(lead.email)) {
        rejectReasons.push('Consumer domain')
      }

      // If any rejections, downgrade to 'new'
      if (rejectReasons.length > 0) {
        rejected++
        
        if (lead.stage === 'high_priority') {
          console.log(`  🗑️  DOWNGRADE: ${lead.first_name || 'NO_NAME'}`)
          console.log(`     Reasons: ${rejectReasons.join(', ')}`)
          
          await supabase
            .from('dialer_raw_leads')
            .update({ stage: 'new', updated_at: new Date().toISOString() })
            .eq('id', lead.id)
        }
        continue
      }

      // VALID - upgrade to high_priority
      if (lead.stage !== 'high_priority') {
        valid++
        console.log(`  ✓ UPGRADE: ${lead.first_name} <${lead.email}>`)
        
        await supabase
          .from('dialer_raw_leads')
          .update({ stage: 'high_priority', updated_at: new Date().toISOString() })
          .eq('id', lead.id)
      }

      if (processed % 50 === 0) {
        process.stdout.write(`  Progress: ${processed}/${leads.length}...\r`)
      }
    }

    // Final count
    const { count: totalPriority } = await supabase
      .from('dialer_raw_leads')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  STRICT RE-SCRUB COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Processed: ${processed}`)
    console.log(`  Valid (upgraded): ${valid}`)
    console.log(`  Rejected (downgraded): ${rejected}`)
    console.log(`  🎯 FINAL HIGH PRIORITY COUNT: ${totalPriority ?? 0}`)
    console.log('═══════════════════════════════════════════════════════════')

    return { processed, valid, rejected }

  } catch (err) {
    console.error('\n💥 ERROR:', err)
    process.exit(1)
  }
}

strictRescrub().then(() => process.exit(0))
