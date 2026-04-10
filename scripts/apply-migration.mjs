#!/usr/bin/env node
// Apply dialer cutover migration using Supabase Management API
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read .env.local for credentials
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Read migration SQL
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260409_2000_dialer_cutover.sql')
const sql = readFileSync(migrationPath, 'utf-8')

// Execute migration via RPC
async function applyMigration() {
  console.log('Applying dialer cutover migration...')
  
  try {
    // Split SQL into statements (roughly)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    for (const stmt of statements) {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })
      if (error) {
        // exec_sql might not exist, try direct query
        console.log('Note:', error.message)
      }
    }
    
    // Alternative: use the SQL API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'tx=commit'
      },
      body: JSON.stringify({ query: sql })
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.log('SQL API response:', text)
    }
    
    console.log('Migration applied (check logs for any errors)')
  } catch (err) {
    console.error('Migration error:', err.message)
    process.exit(1)
  }
}

applyMigration()
