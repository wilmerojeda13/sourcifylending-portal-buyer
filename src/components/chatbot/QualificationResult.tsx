'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import type { QualificationResult } from '@/types'

interface QualificationResultProps {
  result: QualificationResult
  collectedData: Record<string, string>
  onClose: () => void
}

export default function QualificationResult({
  result,
  collectedData,
  onClose,
}: QualificationResultProps) {
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
      }).catch(() => {})
    } catch {}
  }, [result.readiness_status, result.readiness_score])

  const getStatusIcon = (status: string) => {
    if (status === 'Ready') return <CheckCircle size={24} className="text-green-600" />
    if (status === 'Conditionally Ready') return <AlertCircle size={24} className="text-yellow-600" />
    return <XCircle size={24} className="text-red-600" />
  }

  const getStatusColor = (status: string) => {
    if (status === 'Ready') return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
    if (status === 'Conditionally Ready') return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
    return 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800'
  }

  const getHeading = (status: string): string => {
    if (status === 'Ready') return 'You may be a strong candidate'
    if (status === 'Conditionally Ready') return 'You may be a possible candidate'
    return 'You may not be ready yet'
  }

  const getBody = (status: string): string => {
    if (status === 'Ready') return 'Your business profile looks like it may be ready for a funding strategy review.'
    if (status === 'Conditionally Ready') return 'There may be funding paths available, but your profile may need more review first.'
    return 'The best next step is to review your business profile and identify what needs to improve.'
  }

  const isPrimaryCTA = (status: string): boolean => {
    return status !== 'Not Ready'
  }

  return (
    <div className="space-y-4">
      {/* Result Card */}
      <div className={`border-2 rounded-lg p-4 ${getStatusColor(result.readiness_status)}`}>
        <div className="flex items-start gap-3">
          {getStatusIcon(result.readiness_status)}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {getHeading(result.readiness_status)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {getBody(result.readiness_status)}
            </p>
            {result.summary && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                {result.summary}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Key Blockers */}
      {result.blockers && result.blockers.length > 0 && (
        <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Areas to strengthen
          </p>
          <ul className="space-y-1">
            {result.blockers.map((blocker, idx) => (
              <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-xs text-blue-900 dark:text-blue-200">
          <strong>Not a guarantee.</strong> This assessment is not a funding approval. Final options depend on underwriting, lender criteria, credit profile, business profile, and documents.
        </p>
      </div>

      {/* CTAs */}
      <div className="space-y-2">
        {isPrimaryCTA(result.readiness_status) && (
          <Link
            href="/signup"
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
            Create Account
          </Link>
        )}

        <Link
          href="/analyzer"
          className={isPrimaryCTA(result.readiness_status) ? 'btn-secondary w-full justify-center' : 'btn-primary w-full justify-center'}
          onClick={() => {
            try {
              fetch('/api/chatbot/analytics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'cta_clicked', cta_type: 'open_analyzer' }),
              }).catch(() => {})
            } catch {}
          }}
        >
          Open Free Analyzer
        </Link>
      </div>
    </div>
  )
}
