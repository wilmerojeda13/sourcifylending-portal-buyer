'use client'

import { useEffect, useId } from 'react'
import Script from 'next/script'

export default function TurnstileWidget({
  token,
  onTokenChange,
  className = '',
}: {
  token: string
  onTokenChange: (token: string) => void
  className?: string
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const elementId = useId().replace(/:/g, '')

  useEffect(() => {
    if (!siteKey || typeof window === 'undefined') return

    const win = window as Window & {
      onTurnstileSuccess?: (token: string) => void
      onTurnstileExpired?: () => void
    }

    win.onTurnstileSuccess = (nextToken: string) => onTokenChange(nextToken)
    win.onTurnstileExpired = () => onTokenChange('')

    return () => {
      delete win.onTurnstileSuccess
      delete win.onTurnstileExpired
    }
  }, [onTokenChange, siteKey])

  if (!siteKey) {
    return (
      <div className={className}>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-sm font-medium text-red-700">Verification is temporarily unavailable.</p>
          <p className="mt-1 text-xs text-red-600">This form is locked until the site verification key is configured.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3">
        <div
          id={elementId}
          className="cf-turnstile"
          data-sitekey={siteKey}
          data-callback="onTurnstileSuccess"
          data-expired-callback="onTurnstileExpired"
        />
        {!token && (
          <p className="mt-2 text-xs text-gray-500">Complete the verification challenge before submitting.</p>
        )}
      </div>
    </div>
  )
}
