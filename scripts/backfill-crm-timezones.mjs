import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { timezones as lookupTimezones } from 'libphonenumber-geo-carrier'

const ROOT = process.cwd()

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

const envPath = path.join(ROOT, '.env.local')
loadEnvFile(envPath)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase env vars in .env.local')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function splitTimezoneResults(zones) {
  return Array.from(
    new Set(
      (zones ?? [])
        .flatMap(zone => String(zone).split('&'))
        .map(zone => zone.trim())
        .filter(zone => zone && isValidTimeZone(zone))
    )
  )
}

function normalizeRawPhone(rawPhone) {
  const original = rawPhone?.trim() || ''
  const digits = original.replace(/\D/g, '')

  if (!digits) return { originalPhone: original || null, normalizedPhone: null, parseResult: 'empty_input' }
  if (digits.length === 10) return { originalPhone: original, normalizedPhone: `+1${digits}`, parseResult: 'normalized_us_10_digit' }
  if (digits.length === 11 && digits.startsWith('1')) return { originalPhone: original, normalizedPhone: `+${digits}`, parseResult: 'normalized_us_11_digit' }
  if (original.startsWith('+') && digits.length >= 8) return { originalPhone: original, normalizedPhone: `+${digits}`, parseResult: 'normalized_international_plus' }
  return { originalPhone: original, normalizedPhone: null, parseResult: `invalid_digit_count_${digits.length}` }
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function pickSafestTimezone(candidates, now = new Date()) {
  if (!candidates.length) return null
  const decorated = candidates.map(timeZone => {
    const zoned = getZonedParts(now, timeZone)
    return {
      timeZone,
      sortKey: `${String(zoned.year).padStart(4, '0')}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')} ${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`,
    }
  })
  decorated.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return decorated[0]?.timeZone ?? null
}

function resolveTimezoneCandidates(candidates, confidenceOverride) {
  if (!candidates.length) return { likely_timezone: null, timezone_confidence: 'unknown' }
  if (candidates.length === 1) return { likely_timezone: candidates[0], timezone_confidence: confidenceOverride ?? 'high' }
  return { likely_timezone: pickSafestTimezone(candidates), timezone_confidence: confidenceOverride ?? 'medium' }
}

function isNonGeographicNumber(parsed) {
  const type = parsed.getType()
  return type === 'TOLL_FREE' || type === 'PREMIUM_RATE' || type === 'SHARED_COST' || type === 'UAN' || type === 'VOIP'
}

function getNorthAmericanSegments(parsed) {
  if (parsed.countryCallingCode !== '1') return null
  const national = parsed.nationalNumber
  if (!/^\d{10}$/.test(national)) return null
  return {
    areaCode: national.slice(0, 3),
    exchange: national.slice(3, 6),
  }
}

async function lookupTimezoneCandidatesFromPhoneNumber(phoneNumber) {
  return splitTimezoneResults(await lookupTimezones(phoneNumber))
}

async function lookupTimezoneCandidatesFromSyntheticNumber(phone) {
  const parsed = parsePhoneNumberFromString(phone, 'US')
  if (!parsed?.isValid()) return []
  return lookupTimezoneCandidatesFromPhoneNumber(parsed)
}

async function inferLeadPhoneIntelligence(rawPhone) {
  const checkedAt = new Date().toISOString()
  const normalized = normalizeRawPhone(rawPhone)
  if (!normalized.normalizedPhone) {
    return {
      phone_e164: null,
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_invalid',
      last_timezone_checked_at: checkedAt,
    }
  }

  const parsed = parsePhoneNumberFromString(normalized.normalizedPhone, 'US')
  if (!parsed?.isValid()) {
    return {
      phone_e164: null,
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_parse_failure',
      last_timezone_checked_at: checkedAt,
    }
  }

  if (isNonGeographicNumber(parsed)) {
    return {
      phone_e164: parsed.format('E.164'),
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_non_geographic',
      last_timezone_checked_at: checkedAt,
    }
  }

  const fullCandidates = await lookupTimezoneCandidatesFromPhoneNumber(parsed)
  const fullResolved = resolveTimezoneCandidates(fullCandidates)
  if (fullResolved.likely_timezone) {
    return {
      phone_e164: parsed.format('E.164'),
      likely_timezone: fullResolved.likely_timezone,
      timezone_confidence: fullResolved.timezone_confidence,
      timezone_source: 'libphonenumber',
      last_timezone_checked_at: checkedAt,
    }
  }

  const northAmerican = getNorthAmericanSegments(parsed)
  if (northAmerican) {
    const npaNxxCandidates = await lookupTimezoneCandidatesFromSyntheticNumber(`+1${northAmerican.areaCode}${northAmerican.exchange}0000`)
    const npaNxxResolved = resolveTimezoneCandidates(npaNxxCandidates, npaNxxCandidates.length > 1 ? 'low' : 'medium')
    if (npaNxxResolved.likely_timezone) {
      return {
        phone_e164: parsed.format('E.164'),
        likely_timezone: npaNxxResolved.likely_timezone,
        timezone_confidence: npaNxxResolved.timezone_confidence,
        timezone_source: 'npa_nxx_fallback',
        last_timezone_checked_at: checkedAt,
      }
    }

    const areaCandidates = await lookupTimezoneCandidatesFromSyntheticNumber(`+1${northAmerican.areaCode}0000000`)
    const areaResolved = resolveTimezoneCandidates(areaCandidates, areaCandidates.length > 1 ? 'low' : 'medium')
    if (areaResolved.likely_timezone) {
      return {
        phone_e164: parsed.format('E.164'),
        likely_timezone: areaResolved.likely_timezone,
        timezone_confidence: areaResolved.timezone_confidence,
        timezone_source: 'area_code_fallback',
        last_timezone_checked_at: checkedAt,
      }
    }
  }

  return {
    phone_e164: parsed.format('E.164'),
    likely_timezone: null,
    timezone_confidence: 'unknown',
    timezone_source: 'unknown_no_safe_fallback',
    last_timezone_checked_at: checkedAt,
  }
}

async function detectLeadColumns() {
  const { data, error } = await supabase.from('crm_leads').select('*').limit(1)
  if (error) throw error
  return new Set(Object.keys(data?.[0] ?? { id: true, phone: true }))
}

async function fetchLeadCandidates(selectClause, unknownOnly) {
  const pageSize = 500
  let from = 0
  let all = []

  while (true) {
    let query = supabase
      .from('crm_leads')
      .select(selectClause)
      .range(from, from + pageSize - 1)

    if (unknownOnly) {
      query = query.or('timezone_source.like.unknown_%,likely_timezone.is.null')
    }

    const { data, error } = await query

    if (error) throw error
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return all
}

const columns = await detectLeadColumns()
const hasTimezoneColumns =
  columns.has('phone_e164') &&
  columns.has('likely_timezone') &&
  columns.has('timezone_confidence') &&
  columns.has('timezone_source')

const selectClause = hasTimezoneColumns
  ? 'id, phone, phone_e164, likely_timezone, timezone_confidence, timezone_source'
  : 'id, phone'

const leads = await fetchLeadCandidates(selectClause, hasTimezoneColumns)
let changedFromUnknownToResolved = 0
let unchangedUnknown = 0
let updated = 0
let resolvedNow = 0
let unknownNow = 0

for (const lead of leads) {
  const beforeUnknown = hasTimezoneColumns
    ? (!lead.likely_timezone || String(lead.timezone_source ?? '').startsWith('unknown_'))
    : true
  const intelligence = await inferLeadPhoneIntelligence(lead.phone)
  const afterResolved = Boolean(intelligence.likely_timezone) && !String(intelligence.timezone_source).startsWith('unknown_')

  if (afterResolved) {
    resolvedNow += 1
  } else {
    unknownNow += 1
  }

  const needsUpdate = hasTimezoneColumns && (
    lead.phone_e164 !== intelligence.phone_e164 ||
    (lead.likely_timezone ?? null) !== (intelligence.likely_timezone ?? null) ||
    (lead.timezone_confidence ?? 'unknown') !== intelligence.timezone_confidence ||
    (lead.timezone_source ?? null) !== intelligence.timezone_source
  )

  if (needsUpdate) {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        phone_e164: intelligence.phone_e164,
        likely_timezone: intelligence.likely_timezone,
        timezone_confidence: intelligence.timezone_confidence,
        timezone_source: intelligence.timezone_source,
        last_timezone_checked_at: intelligence.last_timezone_checked_at,
      })
      .eq('id', lead.id)

    if (error) throw error
    updated += 1
  }

  if (beforeUnknown && afterResolved) {
    changedFromUnknownToResolved += 1
  } else if (!afterResolved) {
    unchangedUnknown += 1
  }
}

console.log(JSON.stringify({
  liveSchemaHasTimezoneColumns: hasTimezoneColumns,
  scannedLeads: leads.length,
  updated,
  changedFromUnknownToResolved,
  unchangedUnknown,
  resolvedNow,
  unknownNow,
}, null, 2))
