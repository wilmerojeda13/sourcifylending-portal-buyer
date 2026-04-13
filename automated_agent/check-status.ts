#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
  console.log('CHECKING HIGH PRIORITY STATUS\n')
  
  // Count high_priority leads
  const { count } = await sb.from('dialer_raw_leads').select('*', { count: 'exact', head: true }).eq('stage', 'high_priority').eq('is_archived', false)
  console.log('Total high_priority leads:', count)
  
  // Check for consumer emails
  const { data: consumerLeads } = await sb.from('dialer_raw_leads')
    .select('id, first_name, email, stage')
    .eq('stage', 'high_priority')
    .or('email.ilike.*gmail.com,email.ilike.*yahoo.com,email.ilike.*hotmail.com,email.ilike.*outlook.com,email.ilike.*icloud.com,email.ilike.*msn.com,email.ilike.*aol.com,email.ilike.*live.com')
  
  console.log('\nConsumer emails in high_priority:', consumerLeads?.length || 0)
  if (consumerLeads && consumerLeads.length > 0) {
    console.log('\nFIRST 10 BAD LEADS:')
    consumerLeads.slice(0, 10).forEach(l => console.log(`  - ${l.first_name}: ${l.email}`))
  }
  
  // Check for no-email leads
  const { data: noEmail } = await sb.from('dialer_raw_leads')
    .select('id, first_name, email, stage')
    .eq('stage', 'high_priority')
    .or('email.is.null,email.eq.""')
  
  console.log('\nNo-email leads in high_priority:', noEmail?.length || 0)
  
  // Check for junk digit names
  const { data: allHigh } = await sb.from('dialer_raw_leads')
    .select('id, first_name, email')
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
    
  const junkNames = allHigh?.filter(l => /\d{5,}/.test(l.first_name || '')) || []
  console.log('\nJunk digit names in high_priority:', junkNames.length)
  if (junkNames.length > 0) {
    console.log('\nJUNK NAMES:')
    junkNames.slice(0, 5).forEach(l => console.log(`  - ${l.first_name}`))
  }
}

check().then(() => process.exit(0))
