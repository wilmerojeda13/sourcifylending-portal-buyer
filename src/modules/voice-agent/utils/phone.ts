/**
 * Phone number utilities for the Voice Agent module.
 * Uses libphonenumber-js for robust E.164 normalization.
 */
import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js'

export type PhoneParseResult =
  | { valid: true;  e164: string; national: string; country: string }
  | { valid: false; e164: null;   reason: string }

/**
 * Normalize a raw phone string to E.164 format.
 * Defaults to US if no country code present.
 */
export function normalizePhone(raw: string): PhoneParseResult {
  if (!raw?.trim()) {
    return { valid: false, e164: null, reason: 'empty' }
  }

  const cleaned = raw.replace(/[^\d+]/g, '')

  try {
    const phone = parsePhoneNumberFromString(cleaned, 'US')
    if (!phone || !phone.isValid()) {
      // Try with + prefix if not already there
      if (!cleaned.startsWith('+')) {
        const withPlus = parsePhoneNumberFromString('+' + cleaned, 'US')
        if (withPlus?.isValid()) {
          return {
            valid:    true,
            e164:     withPlus.format('E.164'),
            national: withPlus.formatNational(),
            country:  withPlus.country ?? 'US',
          }
        }
      }
      return { valid: false, e164: null, reason: 'invalid_number' }
    }

    return {
      valid:    true,
      e164:     phone.format('E.164'),
      national: phone.formatNational(),
      country:  phone.country ?? 'US',
    }
  } catch {
    return { valid: false, e164: null, reason: 'parse_error' }
  }
}

/**
 * Quick check — is this a plausible US phone number?
 */
export function isValidUSPhone(raw: string): boolean {
  try {
    return isValidPhoneNumber(raw, 'US')
  } catch {
    return false
  }
}

/**
 * Normalize a list of raw phone numbers, deduplicating by E.164.
 * Returns a Map from E.164 → original raw value.
 */
export function deduplicatePhones(raws: string[]): Map<string, string> {
  const seen = new Map<string, string>()
  for (const raw of raws) {
    const result = normalizePhone(raw)
    if (result.valid && !seen.has(result.e164)) {
      seen.set(result.e164, raw)
    }
  }
  return seen
}

/**
 * Format E.164 for display: +15551234567 → (555) 123-4567
 */
export function formatPhoneDisplay(e164: string | null): string {
  if (!e164) return '—'
  try {
    const phone = parsePhoneNumberFromString(e164)
    return phone?.formatNational() ?? e164
  } catch {
    return e164
  }
}

/**
 * Mask phone number for logs: +15551234567 → +1 555 ***-4567
 */
export function maskPhone(e164: string | null): string {
  if (!e164) return '—'
  if (e164.length < 7) return '***'
  return e164.slice(0, -4).replace(/\d/g, '*') + e164.slice(-4)
}
