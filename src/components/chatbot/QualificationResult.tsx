'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import type { QualificationResult, CollectedData } from '@/types'

interface QualificationResultProps {
  result: QualificationResult
  collectedData: Partial<CollectedData>
  onClose: () => void
}

export default function QualificationResult({
  result,
  collectedData,
  onClose,
}: QualificationResultProps) {
  // Track qualification completed event
  useEffect(() => {
    try {
      fetch('/api/chatbot/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'qualification_completed',
          status: result.readiness_status,
          score: result.readiness_score,
        }),
      }).catch(() => {
        // Fail silently - don't break UI if analytics unavailable
      })
    } catch {
      // Ignore analytics errors
    }
  }, [result.readiness_status, result.readiness_score])

  const getStatusIcon = (status: string) => {
    if (status === 'Ready') return <CheckCircle size={24} className="text-green-600" />
    if (status === 'Conditionally Ready') return <AlertCircle size={24} className="text-yellow-600" />
    return <XCircle size={24} className="text-red-600" />
  }

  const getStatusColor = (status: string) => {
    if (status === 'Ready') return 'bg-green-50 border-green-200'
    if (status === 'Conditionally Ready') return 'bg-yellow-50 border-yellow-200'
    return 'bg-gray-50 border-gray-200'
  }

  const getStatusHeading = (status: string): string => {
    if (status === 'Ready') return 'You May Be a Strong Candidate'
    if (status === 'Conditionally Ready') return 'You May Be a Possible Candidate'
    return 'You May Need to Strengthen Your Profile First'
  }

  const getPrimaryCtaRoute = (status: string): string => {
    return '/signup'
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className={`card border-2 p-5 ${getStatusColor(result.readiness_status)}`}>
        <div className="flex items-start gap-3">
          {getStatusIcon(result.readiness_status)}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {getStatusHeading(result.readiness_status)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {result.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Funding Range */}
      {result.funding_range && (
        <div className="card p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Estimated Funding Range
          </p>
          <p className="text-xl font-bold text-green-700 dark:text-green-300">
            {result.funding_range}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Based on your profile. Actual funding depends on full underwriting.
          </p>
        </div>
      )}

      {/* Key Blockers */}
      {result.blockers && result.blockers.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Key Areas to Strengthen
          </p>
          <ul className="space-y-1">
            {result.blockers.map((blocker, idx) => (
              <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-yellow-500 mt-0.5">•</span>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comprehensive Disclaimer */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-xs text-blue-900 dark:text-blue-200">
          <strong>Important:</strong> This assessment is not a funding approval or guarantee. Final options depend on full underwriting, lender criteria, your complete business profile, credit history, financial documents, and more. Qualification is subject to verification and approval by our underwriting team.
        </p>
      </div>

      {/* Next Steps - Conditional CTA based on status */}
      <div className="space-y-2">
        {result.readiness_status === 'Ready' && (
          <>
            <Link
              href={`/signup?from=chatbot&business_name=${encodeURIComponent(collectedData.business_name || '')}&email=${encodeURIComponent(collectedData.email || '')}`}
              className="btn-primary w-full justify-center"
              onClick={() => {
                try {
                  fetch('/api/chatbot/analytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'cta_clicked', cta_type: 'create_account' }),
                  }).catch(() => {})
                } catch {}
              }}
            >
              Create Your Account
            </Link>
            <p className="text-xs text-center text-gray-600 dark:text-gray-400">
              Based on your profile, you may qualify for our programs. Next step: Create an account to proceed with full application.
            </p>
          </>
        )}

        {result.readiness_status === 'Conditionally Ready' && (
          <>
            <Link
              href={`/signup?from=chatbot&business_name=${encodeURIComponent(collectedData.business_name || '')}&email=${encodeURIComponent(collectedData.email || '')}`}
              className="btn-primary w-full justify-center"
              onClick={() => {
                try {
                  fetch('/api/chatbot/analytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'cta_clicked', cta_type: 'create_account' }),
                  }).catch(() => {})
                } catch {}
              }}
            >
              Create Your Account
            </Link>
            <Link
              href="/analyzer"
              className="btn-secondary w-full justify-center"
              onClick={() => {
                try {
                  fetch('/api/chatbot/analytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'cta_clicked', cta_type: 'view_analyzer' }),
                  }).catch(() => {})
                } catch {}
              }}
            >
              View Full Analyzer
            </Link>
            <p className="text-xs text-center text-gray-600 dark:text-gray-400">
              You may qualify, but completing the full analyzer will give you a more comprehensive assessment.
            </p>
          </>
        )}

        {result.readiness_status === 'Not Ready' && (
          <>
            <Link
              href="/analyzer"
              className="btn-primary w-full justify-center"
              onClick={() => {
                try {
                  fetch('/api/chatbot/analytics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'cta_clicked', cta_type: 'view_analyzer' }),
                  }).catch(() => {})
                } catch {}
              }}
            >
              View Full Analyzer
            </Link>
            <p className="text-xs text-center text-gray-600 dark:text-gray-400">
              Complete the full business analyzer to get detailed recommendations on strengthening your profile.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
