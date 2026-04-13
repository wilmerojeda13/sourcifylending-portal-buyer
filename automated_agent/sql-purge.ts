#!/usr/bin/env tsx
/**
 * SQL PURGE: Reset high_priority from junk leads
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

async function purge() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  SQL PURGE: Removing junk from high_priority')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  // Consumer domains to purge
  const blockedDomains = [
    'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
    'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com'
  ]
  
  // Get all high_priority leads
  const { data: leads, error } = await supabase
    .from('dialer_raw_leads')
    .select('id, first_name, email, stage')
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
  
  if (error) {
    console.error('Error fetching leads:', error)
    process.exit(1)
  }
  
  if (!leads || leads.length === 0) {
    console.log('No high_priority leads found')
    return
  }
  
  console.log(`Found ${leads.length} high_priority leads\n`)
  
  let purged = 0
  
  for (const lead of leads) {
    let shouldPurge = false
    let reason = ''
    
    // Check 1: No @ in email
    if (!lead.email || !lead.email.includes('@')) {
      shouldPurge = true
      reason = 'No @ in email'
    }
    // Check 2: Consumer domain
    else {
      const domain = lead.email.split('@')[1]?.toLowerCase()
      if (domain && blockedDomains.includes(domain)) {
        shouldPurge = true
        reason = `Consumer domain: ${domain}`
      }
    }
    
    // Check 3: >4 consecutive digits in first_name (5+)
    if (/\d{5,}/.test(lead.first_name || '')) {
      shouldPurge = true
      reason = reason ? `${reason}, Junk digits in name` : 'Junk digits in name'
    }
    
    if (shouldPurge) {
      purged++
      console.log(`  🗑️  PURGE: ${lead.first_name || 'NO_NAME'}`)
      console.log(`     Reason: ${reason}`)
      
      await supabase
        .from('dialer_raw_leads')
        .update({ stage: 'new', updated_at: new Date().toISOString() })
        .eq('id', lead.id)
    }
  }
  
  // Get final count
  const { count } = await supabase
    .from('dialer_raw_leads')
    .select('*', { count: 'exact', head: true })
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
  
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  PURGE COMPLETE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total high_priority before: ${leads.length}`)
  console.log(`  Purged (downgraded to 'new'): ${purged}`)
  console.log(`  Remaining valid high_priority: ${count ?? 0}`)
  console.log('═══════════════════════════════════════════════════════════')
}

purge().then(() => process.exit(0))
