'use client'

import { CONSENT_TEXT_VERSION, REQUIRED_MESSAGING_DISCLOSURE } from '@/lib/public-form-compliance'
import PublicLegalLinks from './PublicLegalLinks'

type PublicMessagingConsentProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export default function PublicMessagingConsent({
  checked,
  onChange,
  className,
}: PublicMessagingConsentProps) {
  return (
    <div className={className ?? 'rounded-2xl border border-gray-200 bg-gray-50 p-4'}>
      <p className="text-sm font-semibold text-gray-900">SMS consent</p>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{REQUIRED_MESSAGING_DISCLOSURE}</p>
      <label className="mt-4 flex items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
        />
        <span>I agree to receive SMS messages from SourcifyLending at the number I provided.</span>
      </label>
      <PublicLegalLinks className="mt-4 text-xs text-gray-500 leading-relaxed" />
      <p className="mt-2 text-[11px] text-gray-400">Disclosure version: {CONSENT_TEXT_VERSION}</p>
    </div>
  )
}
