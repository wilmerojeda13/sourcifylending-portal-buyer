#!/usr/bin/env node
/**
 * BACKFILL SCRIPT: Reconcile today's call data for accurate reporting
 * 
 * This script:
 * 1. Finds all leads where last_called_at is TODAY (April 13, 2026)
 * 2. Ensures their status reflects the disposition (not still 'new')
 * 3. Updates status to 'attempted' if it was never properly set
 * 
 * Usage: node scripts/backfill-todays-calls.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from project root
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function backfillTodaysCalls() {
  console.log('========================================');
  console.log('BACKFILL: Reconciling Today\'s Call Data');
  console.log('Date: April 13, 2026');
  console.log('========================================\n');

  // Define today's date bounds
  const todayStart = '2026-04-13T00:00:00.000Z';
  const todayEnd = '2026-04-14T00:00:00.000Z';

  try {
    // Step 1: Count leads called today
    console.log('Step 1: Finding leads called today...');
    const { data: todayCalls, error: countError } = await supabase
      .from('dialer_campaign_leads')
      .select('id, status, last_called_at, last_call_outcome, campaign_id')
      .gte('last_called_at', todayStart)
      .lt('last_called_at', todayEnd);

    if (countError) {
      console.error('Error fetching today\'s calls:', countError);
      process.exit(1);
    }

    console.log(`✓ Found ${todayCalls.length} leads with last_called_at today\n`);

    if (todayCalls.length === 0) {
      console.log('No calls found today. Nothing to fix.');
      return;
    }

    // Step 2: Identify leads that need status fix
    const leadsNeedingFix = todayCalls.filter(lead => lead.status === 'new');
    console.log(`Step 2: Checking status integrity...`);
    console.log(`  - Leads with proper status: ${todayCalls.length - leadsNeedingFix.length}`);
    console.log(`  - Leads still marked 'new': ${leadsNeedingFix.length}\n`);

    if (leadsNeedingFix.length === 0) {
      console.log('✓ All leads have correct status. No fix needed.\n');
    } else {
      console.log('Step 3: Fixing leads with status = "new"...');
      
      // Update all 'new' leads to 'attempted'
      const { data: updateResult, error: updateError } = await supabase
        .from('dialer_campaign_leads')
        .update({ 
          status: 'attempted',
          updated_at: new Date().toISOString()
        })
        .gte('last_called_at', todayStart)
        .lt('last_called_at', todayEnd)
        .eq('status', 'new')
        .select('id');

      if (updateError) {
        console.error('Error updating leads:', updateError);
        process.exit(1);
      }

      console.log(`✓ Fixed ${updateResult?.length || 0} leads (status: new → attempted)\n`);
    }

    // Step 4: Show breakdown by outcome
    console.log('Step 4: Call outcome breakdown today:');
    const outcomeCounts = {};
    todayCalls.forEach(lead => {
      const outcome = lead.last_call_outcome || 'unknown';
      outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
    });
    
    Object.entries(outcomeCounts)
      .sort(([,a], [,b]) => b - a)
      .forEach(([outcome, count]) => {
        console.log(`  - ${outcome}: ${count}`);
      });

    // Step 5: Final verification
    console.log('\n========================================');
    console.log('VERIFICATION: Database Query');
    console.log('========================================');
    
    const { count: finalCount, error: finalError } = await supabase
      .from('dialer_campaign_leads')
      .select('*', { count: 'exact', head: true })
      .gte('last_called_at', todayStart)
      .lt('last_called_at', todayEnd);

    if (finalError) {
      console.error('Error in final verification:', finalError);
    } else {
      console.log(`✓ Total calls today (DB source of truth): ${finalCount}`);
      console.log(`\nThis count should now match your dashboard.\n`);
    }

    // Step 6: Show by campaign
    const campaignCounts = {};
    todayCalls.forEach(lead => {
      campaignCounts[lead.campaign_id] = (campaignCounts[lead.campaign_id] || 0) + 1;
    });

    if (Object.keys(campaignCounts).length > 0) {
      console.log('Calls by Campaign ID:');
      Object.entries(campaignCounts).forEach(([campaignId, count]) => {
        console.log(`  - ${campaignId}: ${count} calls`);
      });
    }

    console.log('\n========================================');
    console.log('BACKFILL COMPLETE');
    console.log('========================================');

  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

backfillTodaysCalls();
