import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

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

async function applyMigration() {
  console.log('Applying migration: Add high_priority stage...\n')
  
  // Try using exec_sql RPC if available
  const { error: rpcError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE public.dialer_raw_leads 
      DROP CONSTRAINT IF EXISTS dialer_raw_leads_stage_check;
      
      ALTER TABLE public.dialer_raw_leads 
      ADD CONSTRAINT dialer_raw_leads_stage_check 
      CHECK (stage IN ('new','contacted','interested','callback','follow_up','qualified','promoted','dnc','closed_lost','high_priority'));
    `
  })
  
  if (rpcError) {
    // Fallback: run as two separate queries
    console.log('RPC failed, trying direct query...')
    
    const { error: e1 } = await supabase.from('dialer_raw_leads').select('count').limit(1)
    if (e1?.message?.includes('stage_check')) {
      console.log('Constraint error confirmed - needs manual migration')
      console.log('\n⚠️  Please run this SQL in Supabase Dashboard SQL Editor:')
      console.log(`
ALTER TABLE public.dialer_raw_leads 
DROP CONSTRAINT IF EXISTS dialer_raw_leads_stage_check;

ALTER TABLE public.dialer_raw_leads 
ADD CONSTRAINT dialer_raw_leads_stage_check 
CHECK (stage IN ('new','contacted','interested','callback','follow_up','qualified','promoted','dnc','closed_lost','high_priority'));
      `)
      return false
    }
  } else {
    console.log('✅ Migration applied successfully!')
    return true
  }
  
  return false
}

applyMigration().then(() => process.exit(0))
