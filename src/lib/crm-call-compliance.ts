import { parsePhoneNumberFromString } from 'libphonenumber-js'
import type { PhoneNumber } from 'libphonenumber-js'
import { timezones as lookupTimezones } from 'libphonenumber-geo-carrier'

export type TimezoneConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type CallWindowStatus = 'callable_now' | 'blocked_by_timezone' | 'unknown_timezone'
export type TimezoneSource =
  | 'libphonenumber'
  | 'npa_nxx_fallback'
  | 'area_code_fallback'
  | 'unknown_invalid'
  | 'unknown_non_geographic'
  | 'unknown_parse_failure'
  | 'unknown_no_safe_fallback'

export interface TimezoneDiagnostics {
  original_phone: string | null
  normalized_phone: string | null
  parse_result: string
  libphonenumber_result: string[]
  fallback_result: {
    npa_nxx: string[]
    area_code: string[]
  }
  final_reason: string
}

export interface LeadPhoneIntelligence {
  phone_e164: string | null
  likely_timezone: string | null
  timezone_confidence: TimezoneConfidence
  timezone_source: TimezoneSource
  timezone_reason: string | null
  timezone_source_label: string
  timezone_reason_label: string | null
  last_timezone_checked_at: string
  diagnostics: TimezoneDiagnostics
}

export interface CallWindowEvaluation {
  status: CallWindowStatus
  ruleApplied: string
  likelyTimezone: string | null
  timezoneConfidence: TimezoneConfidence
  timezoneAbbreviation: string | null
  recipientLocalTime: string | null
  blockedReason: string | null
  blockedUntilLabel: string | null
  message: string
}

type LeadLike = {
  phone?: string | null
  phone_e164?: string | null
  likely_timezone?: string | null
  timezone_confidence?: string | null
  timezone_source?: string | null
  last_timezone_checked_at?: string | null
}

const DEFAULT_REGION = 'US'
const DEFAULT_CALL_RULE = {
  key: 'federal_default_8_to_8',
  startHour: 8,
  endHour: 20,
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function splitTimezoneResults(zones: string[] | null | undefined) {
  return Array.from(
    new Set(
      (zones ?? [])
        .flatMap(zone => String(zone).split('&'))
        .map(zone => zone.trim())
        .filter(zone => zone && isValidTimeZone(zone))
    )
  )
}

function getSourceLabel(source: TimezoneSource) {
  switch (source) {
    case 'libphonenumber':
      return 'libphonenumber'
    case 'npa_nxx_fallback':
      return 'npa_nxx_fallback'
    case 'area_code_fallback':
      return 'area_code_fallback'
    case 'unknown_invalid':
      return 'unknown_invalid'
    case 'unknown_non_geographic':
      return 'unknown_non_geographic'
    case 'unknown_parse_failure':
      return 'unknown_invalid'
    case 'unknown_no_safe_fallback':
      return 'unknown_invalid'
  }
}

function getReasonLabel(source: TimezoneSource, reason: string | null) {
  if (reason) return reason.replace(/_/g, ' ')
  if (source.startsWith('unknown_')) return source.replace(/^unknown_/, '').replace(/_/g, ' ')
  return null
}

function buildDiagnostics(overrides: Partial<TimezoneDiagnostics> = {}): TimezoneDiagnostics {
  return {
    original_phone: null,
    normalized_phone: null,
    parse_result: 'not_attempted',
    libphonenumber_result: [],
    fallback_result: {
      npa_nxx: [],
      area_code: [],
    },
    final_reason: 'not_attempted',
    ...overrides,
  }
}

function buildIntelligence(
  checkedAt: string,
  payload: Partial<LeadPhoneIntelligence> & {
    diagnostics: TimezoneDiagnostics
  }
): LeadPhoneIntelligence {
  const source = payload.timezone_source ?? 'unknown_invalid'
  const reason = payload.timezone_reason ?? null

  return {
    phone_e164: payload.phone_e164 ?? null,
    likely_timezone: payload.likely_timezone ?? null,
    timezone_confidence: payload.timezone_confidence ?? 'unknown',
    timezone_source: source,
    timezone_reason: reason,
    timezone_source_label: getSourceLabel(source),
    timezone_reason_label: getReasonLabel(source, reason),
    last_timezone_checked_at: checkedAt,
    diagnostics: payload.diagnostics,
  }
}

function normalizeRawPhone(rawPhone: string | null | undefined) {
  const original = rawPhone?.trim() || ''
  const digits = original.replace(/\D/g, '')

  if (!digits) {
    return {
      originalPhone: original || null,
      normalizedPhone: null,
      digits,
      parseResult: 'empty_input',
    }
  }

  if (digits.length === 10) {
    return {
      originalPhone: original,
      normalizedPhone: `+1${digits}`,
      digits,
      parseResult: 'normalized_us_10_digit',
    }
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return {
      originalPhone: original,
      normalizedPhone: `+${digits}`,
      digits,
      parseResult: 'normalized_us_11_digit',
    }
  }

  if (original.startsWith('+') && digits.length >= 8) {
    return {
      originalPhone: original,
      normalizedPhone: `+${digits}`,
      digits,
      parseResult: 'normalized_international_plus',
    }
  }

  return {
    originalPhone: original,
    normalizedPhone: null,
    digits,
    parseResult: `invalid_digit_count_${digits.length}`,
  }
}

function getZonedParts(date: Date, timeZone: string) {
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
  ) as Record<string, string>

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function pickSafestTimezone(candidates: string[], now: Date = new Date()) {
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

function resolveTimezoneCandidates(candidates: string[], confidenceOverride?: TimezoneConfidence) {
  if (!candidates.length) {
    return {
      likely_timezone: null,
      timezone_confidence: 'unknown' as TimezoneConfidence,
    }
  }

  if (candidates.length === 1) {
    return {
      likely_timezone: candidates[0],
      timezone_confidence: confidenceOverride ?? 'high',
    }
  }

  return {
    likely_timezone: pickSafestTimezone(candidates),
    timezone_confidence: confidenceOverride ?? 'medium',
  }
}

function getNorthAmericanSegments(parsed: PhoneNumber) {
  if (parsed.countryCallingCode !== '1') return null
  const national = parsed.nationalNumber
  if (!/^\d{10}$/.test(national)) return null

  return {
    national,
    areaCode: national.slice(0, 3),
    exchange: national.slice(3, 6),
  }
}

function isNonGeographicNumber(parsed: PhoneNumber) {
  const type = parsed.getType()
  return type === 'TOLL_FREE' || type === 'PREMIUM_RATE' || type === 'SHARED_COST' || type === 'UAN' || type === 'VOIP'
}

async function lookupTimezoneCandidatesFromPhoneNumber(phoneNumber: PhoneNumber | undefined) {
  return splitTimezoneResults(await lookupTimezones(phoneNumber))
}

async function lookupTimezoneCandidatesFromSyntheticNumber(phone: string) {
  const parsed = parsePhoneNumberFromString(phone, DEFAULT_REGION)
  if (!parsed?.isValid()) return []
  return lookupTimezoneCandidatesFromPhoneNumber(parsed)
}

function getTimezoneAbbreviation(timeZone: string, date: Date = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value

  return label ?? null
}

export function formatRecipientLocalTime(timeZone: string, date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function formatHourLabel(hour: number) {
  const normalized = hour % 24
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  const hour12 = normalized % 12 || 12
  return `${hour12}:00 ${suffix}`
}

function formatTomorrowPrefix(now: Date, timeZone: string, nextOpenDateUtc: Date) {
  const nowDay = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now)

  const nextDay = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(nextOpenDateUtc)

  return nowDay === nextDay ? '' : `${nextDay} `
}

function logUnknownTimezone(intelligence: LeadPhoneIntelligence) {
  console.warn('[crm-call-compliance] Unknown timezone result', {
    original_phone: intelligence.diagnostics.original_phone,
    normalized_phone: intelligence.diagnostics.normalized_phone,
    parse_result: intelligence.diagnostics.parse_result,
    libphonenumber_result: intelligence.diagnostics.libphonenumber_result,
    fallback_result: intelligence.diagnostics.fallback_result,
    final_reason: intelligence.diagnostics.final_reason,
  })
}

function buildUnknownEvaluation(intelligence: LeadPhoneIntelligence): CallWindowEvaluation {
  const recipientLocalTime = intelligence.likely_timezone ? formatRecipientLocalTime(intelligence.likely_timezone) : null
  const timezoneAbbreviation = intelligence.likely_timezone ? getTimezoneAbbreviation(intelligence.likely_timezone) : null

  let message = 'Unknown Timezone: this phone number requires manual review before auto-dialing.'

  if (intelligence.timezone_source === 'unknown_invalid' || intelligence.timezone_source === 'unknown_parse_failure') {
    message = 'Unknown Timezone: the phone number is invalid and could not be normalized safely.'
  } else if (intelligence.timezone_source === 'unknown_non_geographic') {
    message = 'Unknown Timezone: this appears to be a toll-free or non-geographic number, so local-time compliance cannot be inferred safely.'
  } else if (intelligence.timezone_reason_label) {
    message = `Unknown Timezone: ${intelligence.timezone_reason_label}. Manual review required before auto-dialing.`
  }

  return {
    status: 'unknown_timezone',
    ruleApplied: DEFAULT_CALL_RULE.key,
    likelyTimezone: intelligence.likely_timezone,
    timezoneConfidence: intelligence.timezone_confidence,
    timezoneAbbreviation,
    recipientLocalTime,
    blockedReason: intelligence.timezone_source,
    blockedUntilLabel: null,
    message,
  }
}

export function evaluateLeadCallWindow(intelligence: LeadPhoneIntelligence, now: Date = new Date()): CallWindowEvaluation {
  if (!intelligence.likely_timezone || intelligence.timezone_source.startsWith('unknown_')) {
    return buildUnknownEvaluation(intelligence)
  }

  const { startHour, endHour, key } = DEFAULT_CALL_RULE
  const zoned = getZonedParts(now, intelligence.likely_timezone)
  const currentMinutes = zoned.hour * 60 + zoned.minute
  const startMinutes = startHour * 60
  const endMinutes = endHour * 60
  const timezoneAbbreviation = getTimezoneAbbreviation(intelligence.likely_timezone, now)
  const recipientLocalTime = formatRecipientLocalTime(intelligence.likely_timezone, now)

  if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
    return {
      status: 'callable_now',
      ruleApplied: key,
      likelyTimezone: intelligence.likely_timezone,
      timezoneConfidence: intelligence.timezone_confidence,
      timezoneAbbreviation,
      recipientLocalTime,
      blockedReason: null,
      blockedUntilLabel: null,
      message: `Callable Now: recipient is in ${intelligence.likely_timezone}. Current local time there is ${recipientLocalTime}.`,
    }
  }

  const blockedUntilDate = new Date(now)
  if (currentMinutes >= endMinutes) {
    blockedUntilDate.setUTCDate(blockedUntilDate.getUTCDate() + 1)
  }

  const nextOpenPrefix = formatTomorrowPrefix(now, intelligence.likely_timezone, blockedUntilDate)
  const blockedUntilLabel = `${nextOpenPrefix}${formatHourLabel(startHour)}${timezoneAbbreviation ? ` ${timezoneAbbreviation}` : ''}`

  return {
    status: 'blocked_by_timezone',
    ruleApplied: key,
    likelyTimezone: intelligence.likely_timezone,
    timezoneConfidence: intelligence.timezone_confidence,
    timezoneAbbreviation,
    recipientLocalTime,
    blockedReason: currentMinutes < startMinutes ? 'before_allowed_window' : 'after_allowed_window',
    blockedUntilLabel,
    message: `Blocked: recipient is in ${intelligence.likely_timezone}. Current local time there is ${recipientLocalTime}. Earliest allowed call: ${blockedUntilLabel}.`,
  }
}

export async function inferLeadPhoneIntelligence(rawPhone: string | null | undefined): Promise<LeadPhoneIntelligence> {
  const checkedAt = new Date().toISOString()
  const normalized = normalizeRawPhone(rawPhone)
  const baseDiagnostics = buildDiagnostics({
    original_phone: normalized.originalPhone,
    normalized_phone: normalized.normalizedPhone,
    parse_result: normalized.parseResult,
  })

  if (!normalized.normalizedPhone) {
    const intelligence = buildIntelligence(checkedAt, {
      phone_e164: null,
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_invalid',
      timezone_reason: 'invalid_number',
      diagnostics: {
        ...baseDiagnostics,
        final_reason: 'invalid_number',
      },
    })
    logUnknownTimezone(intelligence)
    return intelligence
  }

  const parsed = parsePhoneNumberFromString(normalized.normalizedPhone, DEFAULT_REGION)

  if (!parsed?.isValid()) {
    const intelligence = buildIntelligence(checkedAt, {
      phone_e164: null,
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_parse_failure',
      timezone_reason: 'parse_failure',
      diagnostics: {
        ...baseDiagnostics,
        parse_result: `${normalized.parseResult};parse_failed`,
        final_reason: 'parse_failure',
      },
    })
    logUnknownTimezone(intelligence)
    return intelligence
  }

  if (isNonGeographicNumber(parsed)) {
    const intelligence = buildIntelligence(checkedAt, {
      phone_e164: parsed.format('E.164'),
      likely_timezone: null,
      timezone_confidence: 'unknown',
      timezone_source: 'unknown_non_geographic',
      timezone_reason: 'non_geographic_number',
      diagnostics: {
        ...baseDiagnostics,
        parse_result: `${normalized.parseResult};${parsed.country ?? 'unknown_country'};${parsed.getType() ?? 'unknown_type'}`,
        final_reason: 'non_geographic_number',
      },
    })
    logUnknownTimezone(intelligence)
    return intelligence
  }

  const fullCandidates = await lookupTimezoneCandidatesFromPhoneNumber(parsed)
  const fullResolved = resolveTimezoneCandidates(fullCandidates)
  const northAmerican = getNorthAmericanSegments(parsed)

  if (fullResolved.likely_timezone) {
    return buildIntelligence(checkedAt, {
      phone_e164: parsed.format('E.164'),
      likely_timezone: fullResolved.likely_timezone,
      timezone_confidence: fullResolved.timezone_confidence,
      timezone_source: 'libphonenumber',
      timezone_reason: fullCandidates.length > 1 ? 'resolved_from_multiple_candidates' : null,
      diagnostics: {
        ...baseDiagnostics,
        parse_result: `${normalized.parseResult};parsed_valid`,
        libphonenumber_result: fullCandidates,
        final_reason: fullCandidates.length > 1 ? 'resolved_from_multiple_candidates' : 'resolved_from_full_number',
      },
    })
  }

  let npaNxxCandidates: string[] = []
  let areaCodeCandidates: string[] = []

  if (northAmerican) {
    npaNxxCandidates = await lookupTimezoneCandidatesFromSyntheticNumber(`+1${northAmerican.areaCode}${northAmerican.exchange}0000`)
    const npaNxxResolved = resolveTimezoneCandidates(npaNxxCandidates, npaNxxCandidates.length > 1 ? 'low' : 'medium')
    if (npaNxxResolved.likely_timezone) {
      return buildIntelligence(checkedAt, {
        phone_e164: parsed.format('E.164'),
        likely_timezone: npaNxxResolved.likely_timezone,
        timezone_confidence: npaNxxResolved.timezone_confidence,
        timezone_source: 'npa_nxx_fallback',
        timezone_reason: null,
        diagnostics: {
          ...baseDiagnostics,
          parse_result: `${normalized.parseResult};parsed_valid`,
          libphonenumber_result: fullCandidates,
          fallback_result: {
            npa_nxx: npaNxxCandidates,
            area_code: [],
          },
          final_reason: 'resolved_from_npa_nxx_fallback',
        },
      })
    }

    areaCodeCandidates = await lookupTimezoneCandidatesFromSyntheticNumber(`+1${northAmerican.areaCode}0000000`)
    const areaCodeResolved = resolveTimezoneCandidates(areaCodeCandidates, areaCodeCandidates.length > 1 ? 'low' : 'medium')
    if (areaCodeResolved.likely_timezone) {
      return buildIntelligence(checkedAt, {
        phone_e164: parsed.format('E.164'),
        likely_timezone: areaCodeResolved.likely_timezone,
        timezone_confidence: areaCodeResolved.timezone_confidence,
        timezone_source: 'area_code_fallback',
        timezone_reason: null,
        diagnostics: {
          ...baseDiagnostics,
          parse_result: `${normalized.parseResult};parsed_valid`,
          libphonenumber_result: fullCandidates,
          fallback_result: {
            npa_nxx: npaNxxCandidates,
            area_code: areaCodeCandidates,
          },
          final_reason: 'resolved_from_area_code_fallback',
        },
      })
    }
  }

  const intelligence = buildIntelligence(checkedAt, {
    phone_e164: parsed.format('E.164'),
    likely_timezone: null,
    timezone_confidence: 'unknown',
    timezone_source: 'unknown_no_safe_fallback',
    timezone_reason: 'no_safe_fallback_found',
    diagnostics: {
      ...baseDiagnostics,
      parse_result: `${normalized.parseResult};parsed_valid`,
      libphonenumber_result: fullCandidates,
      fallback_result: {
        npa_nxx: npaNxxCandidates,
        area_code: areaCodeCandidates,
      },
      final_reason: 'no_safe_fallback_found',
    },
  })
  logUnknownTimezone(intelligence)
  return intelligence
}

export async function getLeadCompliance(lead: LeadLike, now: Date = new Date()) {
  const intelligence = await getLeadPhoneIntelligenceFromLead(lead)
  const evaluation = evaluateLeadCallWindow(intelligence, now)

  return {
    ...intelligence,
    call_window_status: evaluation.status,
    call_window_rule_applied: evaluation.ruleApplied,
    timezone_abbreviation: evaluation.timezoneAbbreviation,
    recipient_local_time: evaluation.recipientLocalTime,
    blocked_until_label: evaluation.blockedUntilLabel,
    call_window_message: evaluation.message,
    blocked_reason: evaluation.blockedReason,
  }
}

export async function getLeadPhoneIntelligenceFromLead(lead: LeadLike): Promise<LeadPhoneIntelligence> {
  const normalizedConfidence = normalizeTimezoneConfidence(lead.timezone_confidence)
  const normalizedSource = normalizeTimezoneSource(lead.timezone_source)

  if (
    lead.phone_e164 &&
    lead.last_timezone_checked_at &&
    lead.timezone_source &&
    (lead.likely_timezone || normalizedConfidence === 'unknown')
  ) {
    return {
      phone_e164: lead.phone_e164,
      likely_timezone: lead.likely_timezone ?? null,
      timezone_confidence: normalizedConfidence,
      timezone_source: normalizedSource,
      timezone_reason: normalizedSource.startsWith('unknown_') ? normalizedSource.replace(/^unknown_/, '') : null,
      timezone_source_label: getSourceLabel(normalizedSource),
      timezone_reason_label: getReasonLabel(normalizedSource, normalizedSource.startsWith('unknown_') ? normalizedSource.replace(/^unknown_/, '') : null),
      last_timezone_checked_at: lead.last_timezone_checked_at,
      diagnostics: buildDiagnostics({
        normalized_phone: lead.phone_e164,
        final_reason: normalizedSource.startsWith('unknown_') ? normalizedSource.replace(/^unknown_/, '') : 'cached_result',
      }),
    }
  }

  return inferLeadPhoneIntelligence(lead.phone)
}

export function normalizeTimezoneConfidence(value: string | null | undefined): TimezoneConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') {
    return value
  }
  return 'unknown'
}

export function normalizeTimezoneSource(value: string | null | undefined): TimezoneSource {
  if (
    value === 'libphonenumber' ||
    value === 'npa_nxx_fallback' ||
    value === 'area_code_fallback' ||
    value === 'unknown_invalid' ||
    value === 'unknown_non_geographic' ||
    value === 'unknown_parse_failure' ||
    value === 'unknown_no_safe_fallback'
  ) {
    return value
  }

  if (value?.startsWith('libphonenumber')) return 'libphonenumber'
  if (value?.includes('npa')) return 'npa_nxx_fallback'
  if (value?.includes('area')) return 'area_code_fallback'
  if (value?.includes('non_geographic')) return 'unknown_non_geographic'
  if (value?.includes('invalid')) return 'unknown_invalid'
  return 'unknown_invalid'
}
