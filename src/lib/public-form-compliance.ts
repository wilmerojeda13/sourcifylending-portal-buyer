import { NextRequest } from 'next/server'

export const CONSENT_TEXT_VERSION = '2026-04-02-v1'

export const REQUIRED_MESSAGING_DISCLOSURE =
  'By submitting this form, you agree to receive text messages from SourcifyLending about your inquiry, account, and services. Message frequency varies. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase.'

export type CompliancePayload = {
  enabled: boolean
  form_name: string
  page_url: string
  timestamp: string
  consent_text_version: string
  disclosure_text?: string
  consent_given?: boolean
}

export type ComplianceSnapshot = CompliancePayload & {
  ip_address: string
  user_agent: string
}

export function validateCompliancePayload(
  payload: CompliancePayload | undefined,
  expectedFormName: string,
  requireMessagingConsent = true,
) {
  if (!payload?.enabled) {
    return { ok: false, error: 'Compliance payload is required.' as const }
  }

  if (payload.form_name !== expectedFormName) {
    return { ok: false, error: 'Compliance form name mismatch.' as const }
  }

  if (!payload.page_url || !payload.timestamp) {
    return { ok: false, error: 'Compliance metadata is incomplete.' as const }
  }

  if (payload.consent_text_version !== CONSENT_TEXT_VERSION) {
    return { ok: false, error: 'Consent text version mismatch.' as const }
  }

  if (requireMessagingConsent) {
    if (payload.disclosure_text !== REQUIRED_MESSAGING_DISCLOSURE) {
      return { ok: false, error: 'Required SMS disclosure text mismatch.' as const }
    }

    if (!payload.consent_given) {
      return { ok: false, error: 'SMS consent is required before submitting.' as const }
    }
  }

  return { ok: true as const }
}

export function buildComplianceSnapshot(
  req: NextRequest,
  payload: CompliancePayload,
): ComplianceSnapshot {
  return {
    ...payload,
    ip_address:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown',
    user_agent: req.headers.get('user-agent') ?? 'unknown',
  }
}

export function formatComplianceSnapshotLines(snapshot: ComplianceSnapshot, label = 'Compliance') {
  return [
    `[${label}]`,
    `Form Name: ${snapshot.form_name}`,
    `Page URL: ${snapshot.page_url}`,
    `Submitted: ${snapshot.timestamp}`,
    `Consent Text Version: ${snapshot.consent_text_version}`,
    `Messaging Enabled: ${snapshot.enabled ? 'Yes' : 'No'}`,
    typeof snapshot.consent_given === 'boolean'
      ? `Consent Given: ${snapshot.consent_given ? 'Yes' : 'No'}`
      : null,
    snapshot.disclosure_text ? `Disclosure Text: ${snapshot.disclosure_text}` : null,
    `IP Address: ${snapshot.ip_address}`,
    `User Agent: ${snapshot.user_agent}`,
    `[/${label}]`,
  ].filter(Boolean)
}
