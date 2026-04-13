#!/usr/bin/env tsx
/**
 * Link high_priority leads to the scrub campaign
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function link() {
  console.log('LINKING HIGH PRIORITY LEADS TO CAMPAIGN\n')
  
  // Get campaign ID
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
  
  // Get all high_priority raw leads NOT in campaign
  const { data: highPriorityLeads } = await sb
    .from('dialer_raw_leads')
    .select('id, first_name, email, stage')
    .eq('stage', 'high_priority')
    .eq('is_archived', false)
    .is('promoted_to_crm_lead_id', null)
  
  if (!highPriorityLeads || highPriorityLeads.length === 0) {
    console.log('No high_priority leads found')
    return
  }
  
  console.log(`Found ${highPriorityLeads.length} high_priority leads\n`)
  
  // Get existing campaign lead IDs
  const { data: existing } = await sb
    .from('dialer_campaign_leads')
    .select('raw_lead_id')
    .eq('campaign_id', campaign.id)
  
  const existingIds = new Set((existing || []).map(e => e.raw_lead_id))
  
  // Find leads not in campaign
  const toAdd = highPriorityLeads.filter(l => !existingIds.has(l.id))
  
  console.log(`Already in campaign: ${existingIds.size}`)
  console.log(`To add: ${toAdd.length}\n`)
  
  if (toAdd.length === 0) {
    console.log('All leads already in campaign!')
    return
  }
  
  // Add leads to campaign
  let added = 0
  for (const lead of toAdd) {
    const { error } = await sb
      .from('dialer_campaign_leads')
      .insert({
        campaign_id: campaign.id,
        raw_lead_id: lead.id,
        status: 'new',
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    
    if (error) {
      console.log(`Failed to add ${lead.first_name}: ${error.message}`)
    } else {
      added++
      if (added % 10 === 0) {
        process.stdout.write(`Added ${added}/${toAdd.length}...\r`)
      }
    }
  }
  
  console.log(`\n✅ Added ${added} leads to campaign`)
  
  // Verify
  const { count } = await sb
    .from('dialer_campaign_leads')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
  
  console.log(`Total leads in campaign: ${count}`)
}

link().then(() => process.exit(0))
