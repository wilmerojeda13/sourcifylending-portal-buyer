/**
 * Pre-Dial Scrubbing Engine
 *
 * Normalizes, deduplicates, and validates leads before they enter
 * the dial queue. Optionally runs Twilio Lookup for line type.
 */
import { normalizePhone } from '../utils/phone'
import { computeLeadScore, scoreToTier, DEFAULT_WEIGHTS } from './scoring'

export interface RawLeadImport {
  first_name?:    string
  last_name?:     string
  business_name?: string
  owner_name?:    string
  email?:         string
  phone?:         string
  lead_source?:   string
  lead_age_days?: number
  geography?:     string
  [key: string]:  unknown
}

export interface ScrubResult {
  first_name:         string | null
  last_name:          string | null
  business_name:      string | null
  owner_name:         string | null
  email:              string | null
  phone_raw:          string | null
  phone_e164:         string | null
  phone_validated:    boolean
  line_type:          string
  validation_status:  'pending' | 'valid' | 'invalid' | 'skipped'
  lead_source:        string
  lead_age_days:      number | null
  geography:          string | null
  is_duplicate:       boolean
  duplicate_group_id: string | null
  lead_quality_score: number
  lead_priority_tier: number
  do_not_call:        boolean
  flags:              string[]
  metadata:           Record<string, unknown>
}

type LineTypeInfo = {
  lineType:  'mobile' | 'landline' | 'voip' | 'unknown'
  validated: boolean
}

/**
 * Use Twilio Lookup to get line type information.
 * Returns null on failure — caller decides how to handle.
 */
export async function twilioLookup(e164: string): Promise<LineTypeInfo | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return null

  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
    })
    if (!res.ok) return null

    const data = await res.json() as {
      valid: boolean
      line_type_intelligence?: { type: string }
    }

    if (!data.valid) return { lineType: 'unknown', validated: false }

    const raw = data.line_type_intelligence?.type ?? 'unknown'
    const lineTypeMap: Record<string, LineTypeInfo['lineType']> = {
      'mobile':           'mobile',
      'landline':         'landline',
      'voip':             'voip',
      'nonFixedVoip':     'voip',
      'fixedVoip':        'voip',
      'tollFree':         'landline',
      'premium':          'unknown',
    }

    return {
      lineType:  lineTypeMap[raw] ?? 'unknown',
      validated: true,
    }
  } catch {
    return null
  }
}

/**
 * Scrub a single raw lead import row.
 */
export function scrubLead(
  raw: RawLeadImport,
  suppressionSet: Set<string>,
  existingPhones: Set<string>,
): ScrubResult {
  const flags: string[] = []
  const metadata: Record<string, unknown> = {}

  // Normalize names
  const firstName    = raw.first_name?.trim()    || null
  const lastName     = raw.last_name?.trim()     || null
  const businessName = raw.business_name?.trim() || null
  const ownerName    = raw.owner_name?.trim()    || (firstName && lastName ? `${firstName} ${lastName}` : firstName || null)
  const email        = raw.email?.toLowerCase().trim() || null
  const leadSource   = (['purchased','facebook','inbound','other'].includes(raw.lead_source ?? '') ? raw.lead_source : 'other') as string

  // Phone normalization
  const phoneRaw = (raw.phone as string | undefined)?.trim() || null
  let phoneE164: string | null = null
  let validationStatus: ScrubResult['validation_status'] = 'pending'
  let phoneValidated = false

  if (!phoneRaw) {
    flags.push('missing_phone')
    validationStatus = 'invalid'
  } else {
    const parsed = normalizePhone(phoneRaw)
    if (parsed.valid) {
      phoneE164      = parsed.e164
      phoneValidated = true
      validationStatus = 'valid'
    } else {
      flags.push('invalid_phone')
      validationStatus = 'invalid'
      metadata.phone_error = parsed.reason
    }
  }

  // Missing business name
  if (!businessName) flags.push('missing_business_name')
  // Missing owner name
  if (!ownerName)    flags.push('missing_owner_name')

  // Suppression check
  const doNotCall = phoneE164 ? suppressionSet.has(phoneE164) : false
  if (doNotCall) flags.push('suppressed')

  // Duplicate check
  const isDuplicate = phoneE164 ? existingPhones.has(phoneE164) : false
  if (isDuplicate) {
    flags.push('duplicate_phone')
    if (phoneE164) existingPhones.add(phoneE164) // Don't add twice but mark
  } else if (phoneE164) {
    existingPhones.add(phoneE164)
  }

  // Build duplicate group ID (by phone)
  const duplicateGroupId = phoneE164 ? `phone:${phoneE164}` : null

  // Compute initial score
  const { score } = computeLeadScore({
    lead_source:       leadSource,
    business_name:     businessName,
    owner_name:        ownerName,
    email,
    phone_e164:        phoneE164,
    phone_validated:   phoneValidated,
    line_type:         'unknown', // will be updated after Twilio Lookup
    geography:         (raw.geography as string | undefined) || null,
    is_duplicate:      isDuplicate,
    do_not_call:       doNotCall,
    validation_status: validationStatus,
  }, DEFAULT_WEIGHTS)

  return {
    first_name:         firstName,
    last_name:          lastName,
    business_name:      businessName,
    owner_name:         ownerName,
    email,
    phone_raw:          phoneRaw,
    phone_e164:         phoneE164,
    phone_validated:    phoneValidated,
    line_type:          'unknown',
    validation_status:  validationStatus,
    lead_source:        leadSource,
    lead_age_days:      typeof raw.lead_age_days === 'number' ? raw.lead_age_days : null,
    geography:          (raw.geography as string | undefined) || null,
    is_duplicate:       isDuplicate,
    duplicate_group_id: duplicateGroupId,
    lead_quality_score: score,
    lead_priority_tier: scoreToTier(score),
    do_not_call:        doNotCall,
    flags,
    metadata,
  }
}

/**
 * Scrub an entire batch of raw leads.
 * Handles deduplication within the batch itself.
 */
export function scrubBatch(
  raws: RawLeadImport[],
  suppressionSet: Set<string>,
  existingPhones: Set<string> = new Set(),
): ScrubResult[] {
  return raws.map(raw => scrubLead(raw, suppressionSet, existingPhones))
}

/**
 * Parse CSV text into raw lead import records.
 * Flexible header mapping.
 */
export function parseCsvLeads(csv: string): RawLeadImport[] {
  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, '_'))

  const HEADER_MAP: Record<string, string> = {
    'first_name':     'first_name',
    'firstname':      'first_name',
    'fname':          'first_name',
    'last_name':      'last_name',
    'lastname':       'last_name',
    'lname':          'last_name',
    'business':       'business_name',
    'business_name':  'business_name',
    'company':        'business_name',
    'company_name':   'business_name',
    'owner':          'owner_name',
    'owner_name':     'owner_name',
    'contact':        'owner_name',
    'phone':          'phone',
    'phone_number':   'phone',
    'mobile':         'phone',
    'cell':           'phone',
    'telephone':      'phone',
    'email':          'email',
    'email_address':  'email',
    'source':         'lead_source',
    'lead_source':    'lead_source',
    'state':          'geography',
    'geography':      'geography',
    'location':       'geography',
    'age':            'lead_age_days',
    'lead_age':       'lead_age_days',
    'lead_age_days':  'lead_age_days',
  }

  return lines.slice(1).map(line => {
    const values = splitCsvLine(line)
    const record: RawLeadImport = {}
    headers.forEach((header, i) => {
      const mapped = HEADER_MAP[header] ?? header
      record[mapped] = values[i]?.trim() || undefined
    })
    return record
  })
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}
