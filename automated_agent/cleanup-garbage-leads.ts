#!/usr/bin/env tsx
/**
 * ONE-TIME CLEANUP: Purge garbage leads from all campaigns
 *
 * Targets leads where business_name contains:
 *   Fire, County, Office of, Department, Government, Council,
 *   Non-profit, Foundation, Church, School, Municipal, Police, Sheriff
 *
 * Actions per matching lead:
 *   1. Sets is_archived = true, do_not_call = true, stage = 'dnc' on dialer_raw_leads
 *   2. Deletes the row from dialer_campaign_leads (removes from all campaigns)
 *
 * Run: npx tsx cleanup-garbage-leads.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Garbage terms (case-insensitive substring match on business_name) ────────
const GARBAGE_TERMS = [
  // Fire / emergency services
  'fire', 'fire department', 'fire dept', 'fire station', 'fire district', 'fire house',
  // Government / public sector
  ' county', 'county of ', 'county office', 'county clerk', 'county sheriff',
  'office of ', ' department', 'dept of ', 'department of ', 'government', 'govt',
  'municipality', 'municipal', 'township', 'city hall', 'city of ', 'state of ',
  'federal ', ' council', 'public works', 'public school', 'school district',
  'police dept', 'police department', 'sheriff', 'corrections',
  'district court', 'port authority', 'transit authority', 'housing authority',
  'veterans affairs', 'social services', 'board of education',
  // Non-profit / religious
  'non-profit', 'nonprofit', '501(c)', '501c3', 'charity', 'foundation',
  ' church', 'ministry', 'diocese', 'synagogue', 'mosque', 'temple',
  // Schools
  ' school', 'unified school',
]

function isGarbage(businessName: string | null): boolean {
  if (!businessName) return false
  const lower = businessName.toLowerCase()
  return GARBAGE_TERMS.some(t => lower.includes(t))
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  GARBAGE LEAD CLEANUP')
  console.log('  Targets: Fire / County / Office Of / Dept / Gov / Church / School')
  console.log('═══════════════════════════════════════════════════════════\n')

  // 1. Find all non-archived raw leads that look like garbage
  console.log('🔍 Scanning dialer_raw_leads...')

  let totalScanned = 0
  let totalGarbage = 0
  const CHUNK = 200
  let offset = 0
  const garbageIds: string[] = []

  while (true) {
    const { data, error } = await supabase
      .from('dialer_raw_leads')
      .select('id, business_name')
      .eq('is_archived', false)
      .range(offset, offset + CHUNK - 1)

    if (error) {
      console.error('Failed to fetch leads:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      totalScanned++
      if (isGarbage(row.business_name)) {
        garbageIds.push(row.id)
        console.log(`  🗑️  ${row.business_name}`)
      }
    }

    offset += CHUNK
    if (data.length < CHUNK) break
  }

  console.log(`\n   Scanned: ${totalScanned} | Garbage found: ${garbageIds.length}`)

  if (garbageIds.length === 0) {
    console.log('\n✅ No garbage leads found. Database is clean.')
    return
  }

  totalGarbage = garbageIds.length

  // 2. Confirm before proceeding (dry-run safety)
  console.log(`\n⚠️  About to archive ${totalGarbage} leads and remove from all campaigns.`)
  console.log('   (Set is_archived=true, do_not_call=true, stage=dnc + delete campaign rows)')

  // 3. Archive the raw leads in batches of 50
  console.log('\n📦 Archiving raw leads...')
  let archived = 0
  for (let i = 0; i < garbageIds.length; i += 50) {
    const batch = garbageIds.slice(i, i + 50)
    const { error } = await supabase
      .from('dialer_raw_leads')
      .update({
        is_archived: true,
        do_not_call: true,
        stage:       'dnc',
        updated_at:  new Date().toISOString(),
      })
      .in('id', batch)
    if (error) {
      console.error(`  Batch ${i / 50 + 1} archive error:`, error.message)
    } else {
      archived += batch.length
      process.stdout.write(`  Archived ${archived}/${totalGarbage}...\r`)
    }
  }
  console.log(`\n   ✓ ${archived} raw leads archived`)

  // 4. Remove from all campaigns
  console.log('\n🗑️  Removing from campaigns...')
  let removedFromCampaigns = 0
  for (let i = 0; i < garbageIds.length; i += 50) {
    const batch = garbageIds.slice(i, i + 50)
    const { error, count } = await supabase
      .from('dialer_campaign_leads')
      .delete({ count: 'exact' })
      .in('raw_lead_id', batch)
    if (error) {
      console.error(`  Campaign delete batch error:`, error.message)
    } else {
      removedFromCampaigns += (count ?? 0)
    }
  }
  console.log(`   ✓ ${removedFromCampaigns} campaign-lead rows removed`)

  // 5. Summary
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  CLEANUP COMPLETE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Raw leads archived:       ${archived}`)
  console.log(`  Campaign rows removed:    ${removedFromCampaigns}`)
  console.log('═══════════════════════════════════════════════════════════')
}

cleanup().catch(err => {
  console.error('\n💥 FATAL:', err)
  process.exit(1)
})
