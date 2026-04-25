'use client'

import { useState } from 'react'
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
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)

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

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className={`card border-2 p-5 ${getStatusColor(result.readiness_status)}`}>
        <div className="flex items-start gap-3">
          {getStatusIcon(result.readiness_status)}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {result.readiness_status === 'Ready'
                ? 'You Look Ready!'
                : result.readiness_status === 'Conditionally Ready'
                ? 'You May Qualify'
                : 'Not Quite Ready'}
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
        </div>
      )}

      {/* Key Blockers */}
      {result.blockers && result.blockers.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Key Areas to Address
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

      {/* Disclaimer */}
      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
        This is not a funding approval or guarantee. Final options depend on underwriting and lender requirements.
      </p>

      {/* Next Steps */}
      <div className="space-y-2">
        <Link
          href={`/signup?from=chatbot&business_name=${encodeURIComponent(collectedData.business_name || '')}&email=${encodeURIComponent(collectedData.email || '')}`}
          className="btn-primary w-full justify-center"
        >
          Create Your Account
        </Link>
        <Link
          href="/analyzer"
          className="btn-secondary w-full justify-center"
        >
          View Full Analyzer
        </Link>
      </div>
    </div>
  )
}
