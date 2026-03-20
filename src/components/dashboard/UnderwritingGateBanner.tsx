'use client'

import Link from 'next/link'
import { Lock, RefreshCw, ClipboardList, ShieldCheck, TrendingUp, CheckCircle } from 'lucide-react'

interface Props {
  program: string
  /** Total completed reviews for this user (0 = first time) */
  reviewCount?: number
  /** ISO string of next due date — null if never reviewed */
  nextDueAt?: string | null
}

const PROGRAM_META: Record<string, { name: string; steps: string[] }> = {
  program_a: {
    name: '0% Intro APR Card Strategy',
    steps: [
      'Review your personal credit profile',
      'Assess income & card capacity',
      'Identify the best issuer sequence',
      'Generate your personalized roadmap',
    ],
  },
  program_b: {
    name: 'Business Credit Builder',
    steps: [
      'Verify your business identity & EIN',
      'Assess your business credit profile',
      'Review financials & bank activity',
      'Determine your current stage',
      'Generate your personalized roadmap',
    ],
  },
}

function getDaysOverdue(nextDueAt: string): number {
  const diff = Date.now() - new Date(nextDueAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export default function UnderwritingGateBanner({ program, reviewCount = 0, nextDueAt }: Props) {
  const meta = PROGRAM_META[program] ?? PROGRAM_META.program_b
  const isA = program === 'program_a'
  const isRenewal = reviewCount > 0

  // How many days overdue (only relevant for renewal)
  const daysOverdue = isRenewal && nextDueAt ? getDaysOverdue(nextDueAt) : 0
  const overdueLabel = daysOverdue > 0
    ? `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
    : 'Due today'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header Card */}
      <div className={`rounded-2xl px-7 py-8 mb-5 text-center ${
        isRenewal
          ? 'bg-gradient-to-br from-amber-900 to-amber-800'
          : 'bg-gradient-to-br from-gray-900 to-gray-800'
      }`}>
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
          {isRenewal
            ? <RefreshCw size={28} className="text-white" />
            : <Lock size={28} className="text-white" />
          }
        </div>

        {isRenewal ? (
          <>
            <div className="inline-flex items-center gap-1.5 bg-amber-600/60 text-amber-100 text-xs font-bold px-3 py-1 rounded-full mb-3">
              <RefreshCw size={12} /> Monthly Review #{reviewCount + 1} Due — {overdueLabel}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Time to Re-Underwrite Your File
            </h1>
            <p className="text-amber-100 text-sm leading-relaxed max-w-md mx-auto">
              Your <strong className="text-white">{meta.name}</strong> review has expired.
              We re-underwrite your file monthly — just like real banks and vendors do — to track your progress,
              update your risk score, and ensure your roadmap stays accurate.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">
              Step 1: Unlock Your Funding Plan
            </h1>
            <p className="text-gray-300 text-sm leading-relaxed max-w-md mx-auto">
              Before we can build your <strong className="text-white">{meta.name}</strong> roadmap,
              we need to complete a quick underwriting review. This ensures every recommendation
              is built on your actual profile — not generic advice.
            </p>
          </>
        )}

        <div className="mt-6">
          <Link
            href="/underwriting"
            className="inline-flex items-center gap-2.5 bg-green-500 hover:bg-green-400 text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-colors shadow-lg"
          >
            {isRenewal ? <RefreshCw size={17} /> : <ClipboardList size={17} />}
            {isRenewal ? 'Start Monthly Review' : 'Start Underwriting Review'}
          </Link>
          <p className="text-gray-400 text-xs mt-3">
            Takes about 3–5 minutes
            {isRenewal ? ' · Required every 30 days' : ' · Required to unlock your roadmap'}
          </p>
        </div>
      </div>

      {/* Why it matters — renewal-specific messaging */}
      {isRenewal && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">Why we re-underwrite monthly</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Credit profiles change constantly — new tradelines open, balances shift, inquiries age off, and business
            financials evolve. We underwrite your file the same way banks and vendors do: continuously. Your monthly
            review tracks your risk score delta, stage advancement, and keeps your funding opportunities current.
          </p>
        </div>
      )}

      {/* Benefit cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card text-center">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={20} className="text-green-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Verified Profile</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {isRenewal
              ? 'We verify any changes to your file and update your risk score accordingly.'
              : 'Your funding plan will be built on verified data, not guesswork.'}
          </p>
        </div>
        <div className="card text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <TrendingUp size={20} className="text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">
            {isRenewal ? 'Track Progress' : 'Higher Approvals'}
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {isRenewal
              ? 'See your risk score delta and whether your stage has advanced since last review.'
              : 'Applying in the right sequence dramatically increases your success rate.'}
          </p>
        </div>
        <div className="card text-center">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={20} className="text-purple-600" />
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">AI-Powered Plan</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {isRenewal
              ? 'Your roadmap and opportunities are refreshed after each review to reflect your current file.'
              : 'Our AI generates your exact roadmap based on your underwriting results.'}
          </p>
        </div>
      </div>

      {/* What you'll cover */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ClipboardList size={16} className="text-gray-400" />
          {isRenewal ? "What we'll review this month" : "What you'll cover in the review"}
        </h3>
        <div className="space-y-2.5">
          {meta.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                ${isA ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                {i + 1}
              </div>
              <p className="text-sm text-gray-700">{step}</p>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100 mt-3">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-green-700">
              {isRenewal
                ? 'Your roadmap and opportunities unlock immediately after completion.'
                : 'Your personalized roadmap unlocks instantly after completion.'}
            </p>
          </div>
        </div>
      </div>

      {/* Legal line */}
      <p className="text-center text-xs text-gray-400 mt-5 leading-relaxed">
        All recommendations are based on the information you provide during your profile analysis.
        SourcifyLending does not guarantee approvals or funding outcomes.
      </p>
    </div>
  )
}
