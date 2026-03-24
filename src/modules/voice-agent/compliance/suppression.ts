/**
 * Compliance & Suppression Engine
 *
 * Manages the internal suppression list and opt-out detection.
 * B2B mode only — this module enforces that no opt-outs are missed.
 */

// Phrases that trigger immediate opt-out / DNC
export const OPT_OUT_PHRASES = [
  'stop',
  'remove me',
  'remove us',
  'do not call',
  'don\'t call',
  'dont call',
  'not interested permanently',
  'never call',
  'take me off',
  'take us off',
  'unsubscribe',
  'stop calling',
  'stop calling me',
  'put me on the do not call list',
  'put us on the do not call list',
  'i said no',
]

/**
 * Detect if a transcript segment contains an opt-out phrase.
 * Case-insensitive, handles partial matches.
 */
export function detectOptOut(text: string): { detected: boolean; phrase: string | null } {
  const lower = text.toLowerCase().replace(/[^\w\s]/g, ' ')
  for (const phrase of OPT_OUT_PHRASES) {
    if (lower.includes(phrase)) {
      return { detected: true, phrase }
    }
  }
  return { detected: false, phrase: null }
}

/**
 * Detect call classification keywords in AI text output.
 * Returns the most specific disposition found, or null.
 */
export function detectDispositionInText(text: string): string | null {
  const lower = text.toLowerCase()

  // Check for structured marker first: [DISPOSITION:code]
  const markerMatch = text.match(/\[DISPOSITION:(\w+)\]/)
  if (markerMatch) return markerMatch[1]

  // Fallback: keyword detection
  if (lower.includes('transferring') || lower.includes('transfer you') || lower.includes('transferred_live')) return 'transferred_live'
  if (lower.includes('send you the link') || lower.includes('sending the link') || lower.includes('send_link')) return 'send_link'
  if (lower.includes('schedule a callback') || lower.includes('call you back') || lower.includes('callback_requested')) return 'callback_requested'
  if (lower.includes('remove you') || lower.includes('do not call') || lower.includes('do_not_call')) return 'do_not_call'
  if (lower.includes('voicemail') || lower.includes('voice mail')) return 'voicemail'
  if (lower.includes('wrong number') || lower.includes('wrong_number')) return 'wrong_number'
  if (lower.includes('disconnected') || lower.includes('bad_number')) return 'bad_number'
  if (lower.includes('not interested') || lower.includes('not_interested')) return 'not_interested'
  if (lower.includes('decision maker') || lower.includes('decision_maker')) return 'decision_maker'
  if (lower.includes('gatekeeper')) return 'gatekeeper'

  return null
}

/**
 * Extract summary text from AI output: [SUMMARY:brief text]
 */
export function extractSummary(text: string): string | null {
  const match = text.match(/\[SUMMARY:([^\]]+)\]/)
  return match ? match[1].trim() : null
}

/**
 * Dispositions that should immediately add phone to suppression list.
 */
export const AUTO_SUPPRESS_DISPOSITIONS = new Set([
  'do_not_call',
  'bad_number',
  'wrong_number',
])

/**
 * Dispositions that should stop further call attempts on this lead.
 */
export const AUTO_STOP_DISPOSITIONS = new Set([
  'do_not_call',
  'bad_number',
  'wrong_number',
  'business_closed',
])

/**
 * Check if a disposition is positive (qualified).
 */
export function isQualifiedDisposition(disposition: string): boolean {
  return ['decision_maker', 'interested', 'send_link', 'callback_requested', 'transferred_live'].includes(disposition)
}

/**
 * Check if a call should be stopped immediately based on call content.
 */
export function shouldHangUpImmediately(disposition: string): boolean {
  return ['bad_number', 'wrong_number', 'do_not_call'].includes(disposition)
}

/**
 * Compliance warning text shown to admins.
 */
export const COMPLIANCE_DISCLAIMER = `
IMPORTANT COMPLIANCE NOTICE:
This system is designed for B2B outreach only. By using this tool you acknowledge:
1. You are responsible for compliance with all applicable laws including TCPA, TSR, and state regulations.
2. You must maintain and honor your suppression list at all times.
3. You must immediately honor all opt-out requests.
4. You must not call numbers on the National DNC Registry for B2C purposes.
5. You must respect calling hours (typically 8am–9pm local time).
6. This tool does not provide legal advice. Consult a compliance attorney.
`.trim()
