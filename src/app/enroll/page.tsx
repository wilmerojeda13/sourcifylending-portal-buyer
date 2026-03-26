'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import { CheckCircle, Loader2, ChevronDown, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { UserProfile, ProgramId } from '@/types'

const AGREEMENT_VERSION = 'v1.0'

const PROGRAM_DETAILS: Record<ProgramId, { price: string; setupFee?: string; monthlyFee: string; headline: string }> = {
  program_a: {
    setupFee: '$1,500 one-time setup fee',
    monthlyFee: '$399/month',
    price: '$1,500 today, then $399/month starting Day 31',
    headline: '0% Intro APR Advisory',
  },
  program_b: {
    setupFee: '$997 one-time setup fee',
    monthlyFee: '$199/month',
    price: '$997 today, then $199/month starting Day 31',
    headline: 'Business Credit Builder',
  },
  program_c: {
    monthlyFee: '$97/month',
    price: '$97/month',
    headline: 'Capital Monitoring Membership',
  },
}

const AGREEMENT_TEXT = `SOURCIFYLENDING CLIENT ADVISORY AGREEMENT
Version 1.0 | Effective Upon Electronic Acceptance

This Client Advisory Agreement ("Agreement") is entered into between SourcifyLending ("Company," "we," or "us") and the individual or business entity electronically accepting this Agreement ("Client," "you," or "your"). By checking the acceptance box and proceeding to payment, you acknowledge that you have read, understood, and agreed to all terms below.

1. NATURE OF SERVICES
SourcifyLending provides advisory, consulting, and credit strategy services designed to help clients improve their personal and business financial profiles. Our services include, but are not limited to: credit readiness analysis, business credit building guidance, 0% introductory APR card strategy consulting, capital monitoring, and AI-assisted fulfillment support. We are not a bank, lender, credit repair company (as defined under the Credit Repair Organizations Act), or financial institution.

2. NO GUARANTEE OF RESULTS
RESULTS ARE NOT GUARANTEED. SourcifyLending does not guarantee, promise, or warrant any specific credit score improvement, credit limit increases, approval for any credit product, funding amount, or financial outcome of any kind. Credit decisions are made solely by third-party lenders and credit bureaus, and are beyond our control. Past client results are not indicative of future outcomes. Any projections, examples, or estimates provided are illustrative only.

3. PROGRAM ASSIGNMENT AND SERVICES
Upon enrollment, Client will be assigned to a program based on the results of the free financial readiness analyzer. Program assignment is determined by the Company and may be updated at our discretion based on Client's evolving profile. Services are delivered digitally through the SourcifyLending client portal and include access to an AI fulfillment agent, task management tools, document management, progress tracking, and report generation, as applicable to the assigned program.

4. FEES AND PAYMENT TERMS
Client agrees to pay all fees associated with their assigned program as disclosed at enrollment. Program A (0% Intro APR Advisory): $1,500 one-time setup fee charged at enrollment, followed by $399 per month beginning 30 days after the setup fee is processed. Program B (Business Credit Builder): $997 one-time setup fee charged at enrollment, followed by $199 per month beginning 30 days after the setup fee is processed. Program C (Capital Monitoring Membership): $97 per month beginning at enrollment, billed on a recurring monthly basis. All payments are processed securely through Stripe. By providing a payment method, you authorize SourcifyLending to charge the applicable fees on the schedule described above.

5. SUBSCRIPTION AND CANCELLATION POLICY
Subscriptions renew automatically on a monthly basis. Client may cancel at any time by accessing the billing portal within the SourcifyLending client portal or by contacting us in writing. Cancellation takes effect at the end of the current billing period. No partial refunds are issued for unused days within a billing period. Upon cancellation, portal access is restricted and task progress is paused. All data and progress records are retained and will be restored upon reactivation.

6. REFUND POLICY
Setup fees (Programs A and B) are non-refundable once processed. Monthly subscription fees are non-refundable for periods already billed. Exceptions may be considered at the sole discretion of the Company in cases of documented technical failure attributable solely to SourcifyLending. To request a review, contact support in writing within 7 days of the disputed charge.

7. CLIENT RESPONSIBILITIES
Client agrees to: (a) provide accurate, complete, and truthful information throughout the advisory process; (b) promptly complete assigned tasks and respond to guidance provided through the portal; (c) not misrepresent their financial situation, business status, or creditworthiness to any third party as part of or in connection with our services; (d) independently verify all recommendations before acting on them; and (e) maintain the confidentiality of their portal credentials.

8. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SOURCIFYLENDING AND ITS OFFICERS, EMPLOYEES, AGENTS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT OR THE SERVICES PROVIDED, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL THE COMPANY'S TOTAL LIABILITY EXCEED THE TOTAL FEES PAID BY CLIENT IN THE THREE (3) MONTHS PRECEDING THE CLAIM.

9. DISPUTE RESOLUTION
Any dispute arising from this Agreement shall first be addressed through good-faith written communication between the parties. If unresolved within 30 days, disputes shall be submitted to binding arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, with proceedings conducted in Miami-Dade County, Florida. Client waives the right to participate in class actions or class-wide arbitration. This Agreement shall be governed by the laws of the State of Florida.

10. ELECTRONIC AGREEMENT AND SIGNATURE
Client acknowledges that checking the acceptance box and clicking "Proceed to Payment" constitutes a legally binding electronic signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and applicable state law. Client's IP address, browser fingerprint, and timestamp of acceptance are recorded and stored as part of the agreement record. This electronic acceptance has the same legal effect as a handwritten signature.

11. COMMUNICATIONS CONSENT
By entering into this Agreement, Client consents to receive communications from SourcifyLending via email, SMS (if number provided), and through the client portal. These communications may include program updates, task reminders, billing notices, and service announcements. Client may opt out of marketing communications at any time; however, transactional and billing-related communications are required for service delivery.

12. MODIFICATIONS TO THIS AGREEMENT
SourcifyLending reserves the right to modify this Agreement at any time. Clients will be notified of material changes via email and through the portal. Continued use of services following notification constitutes acceptance of the updated terms. Clients who do not agree to modifications may cancel their subscription prior to the effective date of changes.

13. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between Client and SourcifyLending with respect to the subject matter herein and supersedes all prior communications, representations, or agreements, whether oral or written. If any provision of this Agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.

By checking the box below and proceeding to payment, you confirm that you are at least 18 years of age, have the legal authority to enter this Agreement on behalf of yourself or your business, and have read and agreed to all terms stated above.`

export default function EnrollPage() {
  const router = useRouter()
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasScrolled, setHasScrolled] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!p) { router.push('/dashboard'); return }
      setProfile(p)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32
    if (atBottom) setHasScrolled(true)
  }

  const handleScrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  const handleEnroll = async () => {
    if (!profile?.assigned_program) {
      toast.error('No program assigned. Please run the analyzer first.')
      return
    }
    if (!accepted) {
      toast.error('You must read and accept the agreement to continue.')
      return
    }

    setSubmitting(true)

    // 1. Save agreement acceptance
    const agreementRes = await fetch('/api/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        program: profile.assigned_program,
        agreement_version: AGREEMENT_VERSION,
      }),
    })

    if (!agreementRes.ok) {
      toast.error('Failed to record agreement. Please try again.')
      setSubmitting(false)
      return
    }

    // 2. Start Stripe Checkout
    const checkoutRes = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program: profile.assigned_program }),
    })

    const data = await checkoutRes.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      toast.error(data.error || 'Failed to start checkout. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-green-600" />
      </div>
    )
  }

  if (!profile?.assigned_program) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full card text-center py-10">
          <AlertCircle size={36} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Program Assigned</h2>
          <p className="text-gray-500 text-sm mb-6">
            Please complete the free analyzer first so we can assign the right program for you.
          </p>
          <a href="/analyzer" className="btn-primary w-full py-3.5">Run Free Analyzer</a>
        </div>
      </div>
    )
  }

  const program = profile.assigned_program
  const details = PROGRAM_DETAILS[program]
  const isActive = profile.subscription_status === 'active' || profile.subscription_status === 'trialing'

  if (isActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full card text-center py-10">
          <CheckCircle size={36} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re Already Enrolled</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your {getProgramShortLabel(program)} subscription is active.
          </p>
          <a href="/dashboard" className="btn-primary w-full py-3.5">Go to Dashboard</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">SL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Enroll in Your Program</h1>
          <p className="text-gray-500 text-sm mt-1">Review and accept your client agreement to proceed</p>
        </div>

        {/* Program Summary */}
        <div className="card mb-6 bg-green-50 border border-green-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Your Assigned Program</p>
              <h2 className="text-lg font-bold text-gray-900">{details.headline}</h2>
              <p className="text-green-700 font-semibold text-sm mt-1">{details.price}</p>
            </div>
            <div className="text-right shrink-0">
              {details.setupFee && (
                <p className="text-xs text-gray-500">Setup: {details.setupFee}</p>
              )}
              <p className="text-xs text-gray-500">Monthly: {details.monthlyFee}</p>
            </div>
          </div>
        </div>

        {/* Agreement */}
        <div className="card mb-6">
          <h3 className="font-bold text-gray-900 mb-1">Client Advisory Agreement</h3>
          <p className="text-xs text-gray-500 mb-3">
            Please read the full agreement. You must scroll to the bottom before accepting.
          </p>

          <div className="relative">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-72 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50 text-xs text-gray-700 leading-relaxed whitespace-pre-line font-mono"
            >
              {AGREEMENT_TEXT}
            </div>

            {!hasScrolled && (
              <button
                type="button"
                onClick={handleScrollToBottom}
                className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-green-600 bg-white border border-green-200 rounded-lg px-3 py-1.5 shadow-sm hover:bg-green-50 transition-colors"
              >
                Scroll to bottom <ChevronDown size={12} />
              </button>
            )}
          </div>

          {/* Acceptance Checkbox */}
          <label
            className={`mt-4 flex items-start gap-3 cursor-pointer rounded-xl p-3 border transition-colors ${
              hasScrolled
                ? 'border-gray-200 hover:border-green-300'
                : 'border-gray-100 opacity-50 pointer-events-none'
            }`}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={!hasScrolled}
              className="mt-0.5 w-4 h-4 accent-green-600 shrink-0"
            />
            <span className="text-sm text-gray-700 leading-snug">
              I have read, understood, and agree to the SourcifyLending Client Advisory Agreement (Version 1.0). I understand that results are not guaranteed and that fees are non-refundable as described. I authorize SourcifyLending to charge my payment method as outlined above. This constitutes my electronic signature.
            </span>
          </label>

          {!hasScrolled && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertCircle size={12} /> Scroll to the bottom of the agreement to enable acceptance.
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={handleEnroll}
          disabled={!accepted || submitting}
          className="btn-primary w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 size={18} className="animate-spin" /> Recording acceptance &amp; redirecting…</>
          ) : (
            'Accept Agreement & Proceed to Payment'
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed px-2">
          Your acceptance timestamp, IP address, and agreement version are recorded for legal compliance.
          Stripe handles all payment processing — your card details are never stored by SourcifyLending.
        </p>

        <div className="text-center mt-4">
          <a href="/billing" className="text-sm text-gray-400 hover:text-gray-600">← Back to Billing</a>
        </div>
      </div>
    </div>
  )
}
