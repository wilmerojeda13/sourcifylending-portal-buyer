'use client'

import { useState } from 'react'
import { Shield, CheckCircle, AlertCircle, Loader2, Lock } from 'lucide-react'

interface Props {
  programLabel: string
  userName: string
  onComplete: () => void
}

const AGREEMENT_VERSION = 'v2.0'

const SERVICE_AGREEMENT_TEXT = `SOURCIFY LENDING — SERVICE AGREEMENT & NO-REFUND POLICY

By accepting access to this portal, you agree to the following terms:

1. SERVICES PROVIDED
SourcifyLending provides AI-guided business credit advisory services, including roadmap generation, document review, vendor account guidance, and progress coaching. Specific deliverables include: personalized credit-building roadmap, AI-powered task guidance, document classification and review, vendor account recommendations, and ongoing coaching via the platform.

2. NO-REFUND POLICY
All payments are non-refundable once access to the portal is granted. This applies to setup fees, partial payments, monthly fees, and any other charges. By accepting portal access, you acknowledge that service delivery begins immediately upon activation.

3. NO GUARANTEE OF RESULTS
Business credit outcomes depend on your individual financial history, actions taken, and third-party decisions outside our control. SourcifyLending does not guarantee approval for any credit product, loan, or funding. Results vary.

4. SERVICE DELIVERY
Services are delivered digitally through this portal. Access to your AI agent, roadmap, progress tracker, document tools, and coaching resources constitutes delivery of services. You understand that digital access = service rendered.

5. DISPUTE RESOLUTION
Before initiating any dispute with your card issuer or bank, you agree to contact SourcifyLending directly at support@sourcifylending.com and allow 5 business days to resolve the matter.

6. ELECTRONIC SIGNATURE
By typing your full name and clicking "I Accept & Enter Portal", you are providing your electronic signature and agreeing to these terms with the same legal effect as a handwritten signature.`

export default function WelcomeGate({ programLabel, userName, onComplete }: Props) {
  const [signedName, setSignedName] = useState('')
  const [noRefundChecked, setNoRefundChecked] = useState(false)
  const [disputeChecked, setDisputeChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    signedName.trim().length >= 3 &&
    noRefundChecked &&
    disputeChecked &&
    !loading

  async function handleAccept() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/agreements/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signed_name: signedName.trim(),
          agreement_version: AGREEMENT_VERSION,
          program_label: programLabel,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save agreement')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-950/90 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl my-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-t-2xl px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-1">
            <Shield className="h-6 w-6" />
            <h1 className="text-xl font-bold">Service Agreement & Portal Access</h1>
          </div>
          <p className="text-blue-200 text-sm">
            Please review and sign before accessing your {programLabel} dashboard.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Welcome message */}
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
            <p className="text-blue-900 dark:text-blue-100 text-sm font-medium">
              Welcome, {userName.split(' ')[0]}! One quick step before you get started.
            </p>
            <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
              Review the agreement below, type your full name as your electronic signature, and you&apos;ll have immediate access to your portal.
            </p>
          </div>

          {/* Agreement text */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Service Agreement
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-56 overflow-y-auto">
              <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {SERVICE_AGREEMENT_TEXT}
              </pre>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={noRefundChecked}
                onChange={e => setNoRefundChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 cursor-pointer bg-white dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                <strong>I understand all payments are non-refundable</strong> once portal access is granted. Service delivery begins immediately upon activation.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={disputeChecked}
                onChange={e => setDisputeChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 cursor-pointer bg-white dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                <strong>I agree to contact SourcifyLending first</strong> at support@sourcifylending.com before initiating any dispute with my card issuer, allowing 5 business days to resolve.
              </span>
            </label>
          </div>

          {/* Electronic signature */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Electronic Signature — Type Your Full Legal Name
            </label>
            <input
              type="text"
              value={signedName}
              onChange={e => setSignedName(e.target.value)}
              placeholder="Your Full Name"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white bg-white dark:bg-gray-800 font-medium text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-normal placeholder:text-base placeholder:tracking-normal"
              style={{ fontFamily: 'Georgia, serif' }}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Typing your name constitutes a legally binding electronic signature (ESIGN Act).
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleAccept}
            disabled={!canSubmit}
            className={`w-full py-4 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all
              ${canSubmit
                ? 'bg-blue-700 hover:bg-blue-800 shadow-lg hover:shadow-xl'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving your agreement…
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                I Accept & Enter Portal
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Agreement version {AGREEMENT_VERSION} · Signed agreement stored securely with timestamp and IP address
          </p>
        </div>
      </div>
    </div>
  )
}
