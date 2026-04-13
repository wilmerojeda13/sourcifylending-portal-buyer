#!/usr/bin/env tsx
/**
 * Cleanup script: Remove 'high_priority' from junk leads
 * 
 * Criteria for removal:
 * 1. More than 5 digits in the first_name field
 * 2. Contains SMS/junk keywords like 'STOP', 'opt out', 'Message frequency'
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

// SMS/Junk keywords
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'reply stop to', 'text stop', 'help info',
  'auto-confirm', 'automated message', 'do not reply',
  'sms terms', 'terms and conditions', 'privacy policy',
  'carrier rates', 'msg&data', 'msg & data', 'data rates',
])

// Check for long sequences of digits (>5 in name indicates junk)
function hasLongDigitSequence(value: string | null, maxDigits = 5): boolean {
  if (!value) return false
  const digitRuns = value.match(new RegExp(`\\d{${maxDigits + 1},}`, 'g'))
  return !!digitRuns && digitRuns.length > 0
}

// Check for junk keywords
function containsJunkKeywords(value: string | null): boolean {
  if (!value) return false
  const lowerValue = value.toLowerCase()
  return Array.from(JUNK_KEYWORDS).some(keyword => lowerValue.includes(keyword))
}

// Check if lead is junk
function isJunkLead(lead: { first_name?: string; last_name?: string | null; email?: string | null; business_name?: string | null; notes?: string | null }): boolean {
  const allText = [
    lead.first_name,
    lead.last_name,
    lead.email,
    lead.business_name,
    lead.notes,
  ].filter(Boolean).join(' ')

  // More than 5 digits in name = junk
  if (hasLongDigitSequence(lead.first_name, 5)) return true

  // Junk keywords anywhere
  if (containsJunkKeywords(allText)) return true

  return false
}

async function cleanupJunkPriorityLeads(): Promise<{ checked: number; cleaned: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  CLEANUP: Remove high_priority from junk leads')
  console.log('═══════════════════════════════════════════════════════════\n')

  let checked = 0
  let cleaned = 0

  try {
    // Fetch all high_priority leads
    const { data: leads, error } = await supabase
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, email, business_name, notes, stage, source')
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    if (error) throw error
    if (!leads || leads.length === 0) {
      console.log('✅ No high_priority leads to check')
      return { checked: 0, cleaned: 0 }
    }

    console.log(`🔍 Checking ${leads.length} high_priority leads for junk...\n`)

    for (const lead of leads) {
      checked++

      if (isJunkLead(lead)) {
        console.log(`  🗑️  JUNK: ${lead.first_name} (${lead.id.slice(0, 8)}...)`)

        // Downgrade to 'new' stage
        const { error: updateError } = await supabase
          .from('dialer_raw_leads')
          .update({
            stage: 'new',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        if (updateError) {
          console.log(`     ❌ Failed to clean: ${updateError.message}`)
          continue
        }

        cleaned++
        console.log(`     → Downgraded to 'new' (${cleaned} total cleaned)`)

        // Audit log
        await supabase.from('crm_audit_logs').insert({
          action_type: 'stage_updated',
          entity_type: 'lead',
          entity_ids: [lead.id],
          summary: 'Cleanup: Junk lead removed from High Priority',
          details: {
            first_name: lead.first_name,
            email: lead.email,
            previous_stage: 'high_priority',
            new_stage: 'new',
            reason: 'junk_detection',
            source: 'cleanup-script',
          },
          performed_by_name: 'Lead Processor Cleanup',
        })
      }

      if (checked % 20 === 0) {
        process.stdout.write(`  Checked ${checked}/${leads.length}...\r`)
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  CLEANUP COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Checked: ${checked} high_priority leads`)
    console.log(`  Cleaned: ${cleaned} junk leads (downgraded to 'new')`)
    console.log(`  Remaining: ${checked - cleaned} valid high_priority leads`)
    console.log('═══════════════════════════════════════════════════════════')

    return { checked, cleaned }

  } catch (err) {
    console.error('\n💥 ERROR:', err)
    process.exit(1)
  }
}

cleanupJunkPriorityLeads().then(() => process.exit(0))
