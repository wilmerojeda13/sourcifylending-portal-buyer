'use client'

/**
 * AnalyzerResultClaimer
 *
 * Silently runs after Google OAuth sign-up. When a user ran the free analyzer
 * as a guest and then signed up with Google, their results were saved to
 * sessionStorage before the OAuth redirect. This component reads that data
 * on mount, claims it via the API, and refreshes the page so the
 * ProspectDashboard renders with their actual results.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AnalyzerResultClaimer() {
  const router = useRouter()

  useEffect(() => {
    const claim = async () => {
      try {
        const raw = sessionStorage.getItem('pending_analyzer_result')
        if (!raw) return

        const { result, lead_id, contact_name, business_name, crm_invite_id, crm_analyzer_session_id } = JSON.parse(raw)
        if (!result?.assigned_program) return

        const res = await fetch('/api/auth/claim-analyzer-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result, lead_id, contact_name, business_name, crm_invite_id, crm_analyzer_session_id }),
        })

        if (res.ok) {
          sessionStorage.removeItem('pending_analyzer_result')
          // Refresh so the dashboard re-fetches the updated profile
          router.refresh()
        }
      } catch {
        // Silent — never break the dashboard over this
      }
    }

    claim()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
