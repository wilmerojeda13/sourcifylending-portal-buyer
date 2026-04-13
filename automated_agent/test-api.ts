#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function test() {
  console.log('TESTING API EQUIVALENT\n')
  
  // Get campaign ID for "all data scrub campaign"
  const { data: campaign } = await sb
    .from('dialer_campaigns')
    .select('id')
    .ilike('name', 'all data scrub campaign')
    .eq('status', 'active')
    .single()
  
  if (!campaign) {
    console.log('No scrub campaign found')
    return
  }
  
  console.log('Campaign ID:', campaign.id)
  
  // Get high_priority leads (same as API query)
  const { data: leads, error } = await sb
    .from('dialer_campaign_leads')
    .select(`
      id, campaign_id, raw_lead_id, status,
      raw_lead:dialer_raw_leads!inner(
        id, first_name, last_name, email, stage
      )
    `)
    .eq('campaign_id', campaign.id)
    .eq('raw_lead.stage', 'high_priority')
    .range(0, 999999)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  // Filter out DNC/archived (same as API)
  const validLeads = (leads ?? []).filter((l: any) => {
    const raw = l.raw_lead
    return raw && !raw.do_not_call && !raw.is_archived
  })
  
  console.log('\nAPI would return:', validLeads.length, 'high_priority leads')
  
  // Check for any consumer emails
  const bad = validLeads.filter((l: any) => {
    const email = l.raw_lead?.email?.toLowerCase() || ''
    return email.includes('gmail.com') || 
           email.includes('yahoo.com') || 
           email.includes('hotmail.com') ||
           email.includes('outlook.com') ||
           email.includes('icloud.com') ||
           email.includes('msn.com') ||
           email.includes('aol.com') ||
           email.includes('live.com')
  })
  
  console.log('Consumer emails in results:', bad.length)
  if (bad.length > 0) {
    console.log('\nBAD EXAMPLES:')
    bad.slice(0, 3).forEach((l: any) => console.log('  -', l.raw_lead.first_name, ':', l.raw_lead.email))
  }
  
  // Check for junk digits
  const junkNames = validLeads.filter((l: any) => /\d{5,}/.test(l.raw_lead?.first_name || ''))
  console.log('\nJunk digit names:', junkNames.length)
}

test().then(() => process.exit(0))
