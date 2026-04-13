#!/usr/bin/env tsx
/**
 * URGENT CLEANUP: Remove 'high_priority' from leads that fail the digit-check
 * 
 * Criteria: first_name contains more than 5 consecutive digits (6+)
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

// STRICT: More than 5 consecutive digits = junk (6+)
const DIGIT_SEQUENCE_REGEX = /\d{6,}/

function hasLongDigitSequence(firstName: string): boolean {
  return DIGIT_SEQUENCE_REGEX.test(firstName)
}

// Check for junk keywords
const JUNK_KEYWORDS = new Set([
  'stop', 'opt out', 'opt-out', 'unsubscribe', 'message frequency',
  'reply stop', 'text stop', 'help info', 'auto-confirm',
  'automated message', 'do not reply', 'sms terms',
  'terms and conditions', 'privacy policy', 'carrier rates',
  'msg&data', 'msg & data', 'data rates',
])

function containsJunkKeywords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return Array.from(JUNK_KEYWORDS).some(kw => lowerText.includes(kw))
}

async function cleanupJunkHighPriority(): Promise<{ checked: number; cleaned: number }> {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  URGENT CLEANUP: Remove high_priority from junk leads')
  console.log('  Criteria: >5 consecutive digits OR SMS/junk keywords')
  console.log('═══════════════════════════════════════════════════════════\n')

  let checked = 0
  let cleaned = 0

  try {
    // Get ALL high_priority leads
    const { data: leads, error } = await supabase
      .from('dialer_raw_leads')
      .select('id, first_name, last_name, email, business_name, notes')
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    if (error) throw error
    if (!leads || leads.length === 0) {
      console.log('✅ No high_priority leads found')
      return { checked: 0, cleaned: 0 }
    }

    console.log(`🔍 Checking ${leads.length} high_priority leads for junk...\n`)

    for (const lead of leads) {
      checked++
      
      const allText = `${lead.first_name} ${lead.last_name || ''} ${lead.email || ''} ${lead.business_name || ''} ${lead.notes || ''}`
      const isJunk = hasLongDigitSequence(lead.first_name) || containsJunkKeywords(allText)

      if (isJunk) {
        console.log(`  🗑️  REMOVING high_priority: ${lead.first_name} (${lead.id.slice(0, 8)}...)`)

        const { error: updateError } = await supabase
          .from('dialer_raw_leads')
          .update({
            stage: 'new',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        if (updateError) {
          console.log(`     ❌ Failed: ${updateError.message}`)
          continue
        }

        cleaned++
        console.log(`     → Downgraded to 'new'`)

        // Audit log
        await supabase.from('crm_audit_logs').insert({
          action_type: 'stage_updated',
          entity_type: 'lead',
          entity_ids: [lead.id],
          summary: 'URGENT CLEANUP: Junk lead removed from High Priority',
          details: {
            first_name: lead.first_name,
            email: lead.email,
            previous_stage: 'high_priority',
            new_stage: 'new',
            reason: 'junk_detection_cleanup',
            has_digit_sequence: hasLongDigitSequence(lead.first_name),
            has_junk_keywords: containsJunkKeywords(allText),
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
    console.log(`  Cleaned: ${cleaned} junk leads`)
    console.log(`  Remaining valid: ${checked - cleaned} high_priority leads`)
    console.log('═══════════════════════════════════════════════════════════')

    return { checked, cleaned }

  } catch (err) {
    console.error('\n💥 ERROR:', err)
    process.exit(1)
  }
}

cleanupJunkHighPriority().then(() => process.exit(0))
