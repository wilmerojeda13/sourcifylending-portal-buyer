#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey)
const timeZone = 'America/New_York'

function getParts(date, tz) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const pick = (type) => Number(parts.find(part => part.type === type)?.value || 0)
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
    millisecond: date.getMilliseconds(),
  }
}

function zonedTimeToUtc(parts, tz) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0,
  )

  const guessDate = new Date(utcGuess)
  const guessedParts = getParts(guessDate, tz)
  const guessedUtc = Date.UTC(
    guessedParts.year,
    guessedParts.month - 1,
    guessedParts.day,
    guessedParts.hour,
    guessedParts.minute,
    guessedParts.second,
    guessedParts.millisecond,
  )

  return new Date(utcGuess - (guessedUtc - guessDate.getTime()))
}

function getDateKey(date, tz) {
  const parts = getParts(date, tz)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

function getDateRange(dateKey, tz) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return {
    start: zonedTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz),
    end: zonedTimeToUtc({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz),
  }
}

const todayKey = getDateKey(new Date(), timeZone)
const todayRange = getDateRange(todayKey, timeZone)

const [{ data: attemptedLeads, error: attemptedError }, { data: callLogs, error: callLogsError }] = await Promise.all([
  supabase
    .from('dialer_campaign_leads')
    .select('id, raw_lead_id, campaign_id, status, last_called_at')
    .eq('status', 'attempted')
    .gte('last_called_at', todayRange.start.toISOString())
    .lte('last_called_at', todayRange.end.toISOString()),
  supabase
    .from('call_logs')
    .select('lead_id, raw_lead_id, campaign_lead_id, campaign_id, timestamp')
    .eq('source_system', 'dialer')
    .gte('timestamp', todayRange.start.toISOString())
    .lte('timestamp', todayRange.end.toISOString()),
])

if (attemptedError) {
  console.error('Failed to read attempted leads:', attemptedError.message)
  process.exit(1)
}

if (callLogsError) {
  console.error('Failed to read call logs:', callLogsError.message)
  process.exit(1)
}

const attemptedRows = attemptedLeads ?? []
const callLogRows = callLogs ?? []
const logLeadIds = new Set(
  callLogRows
    .map(row => row.raw_lead_id || row.lead_id)
    .filter(Boolean),
)

const missing = attemptedRows.filter(row => !logLeadIds.has(row.raw_lead_id))

console.log(`Eastern date: ${todayKey}`)
console.log(`Attempted leads today: ${attemptedRows.length}`)
console.log(`Dial logs today: ${callLogRows.length}`)
console.log(`Attempted leads missing logs: ${missing.length}`)

if (missing.length > 0) {
  console.log('Missing raw lead IDs:')
  for (const row of missing.slice(0, 50)) {
    console.log(`- ${row.raw_lead_id} (campaign ${row.campaign_id}, lead ${row.id})`)
  }
  process.exit(1)
}

console.log('Verification passed.')
