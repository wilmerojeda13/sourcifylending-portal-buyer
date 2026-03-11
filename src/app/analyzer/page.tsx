'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, XCircle, ChevronRight } from 'lucide-react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import type { AnalyzerInput, AnalyzerResult } from '@/types'

const TOTAL_STEPS = 12

const QUESTIONS = [
  {
    id: 'business_name', label: 'Business Name', type: 'text',
    placeholder: 'Acme LLC', helpText: 'Legal name of your business',
  },
  {
    id: 'business_age', label: 'How long has your business been operating?', type: 'select',
    options: ['Less than 6 months', '6-12 months', '1-2 years', '2-5 years', '5+ years'],
  },
  {
    id: 'entity_type', label: 'What is your business entity type?', type: 'select',
    options: ['LLC', 'S-Corporation', 'C-Corporation', 'Sole Proprietor', 'Partnership', 'Other'],
  },
  {
    id: 'industry', label: 'What industry is your business in?', type: 'text',
    placeholder: 'e.g. Real Estate, Trucking, Retail, Consulting',
  },
  {
    id: 'monthly_revenue_range', label: 'What is your average monthly business revenue?', type: 'select',
    options: ['$0 - $2,500', '$2,500 - $10,000', '$10,000 - $25,000', '$25,000 - $50,000', '$50,000 - $100,000', '$100,000+'],
  },
  {
    id: 'monthly_deposit_range', label: 'What is your average monthly bank deposit amount?', type: 'select',
    options: ['$0 - $2,500', '$2,500 - $10,000', '$10,000 - $25,000', '$25,000 - $50,000', '$50,000+'],
  },
  {
    id: 'nsf_last_90_days', label: 'Have you had any NSF or overdraft activity in the last 90 days?', type: 'boolean',
    helpText: 'NSF = Non-Sufficient Funds. This significantly impacts lender decisions.',
  },
  {
    id: 'credit_score_range', label: 'What is your personal credit score range?', type: 'select',
    options: ['Below 580', '580-619', '620-639', '640-659', '660-679', '680-699', '700-719', '720+'],
  },
  {
    id: 'utilization_range', label: 'What is your current personal credit utilization?', type: 'select',
    options: ['0-9%', '10-29%', '30-49%', '50-74%', '75%+'],
    helpText: 'Total credit used ÷ total credit available across all cards',
  },
  {
    id: 'inquiry_count_last_90_days', label: 'How many credit inquiries have you had in the last 90 days?', type: 'select',
    options: ['0', '1-2', '3-5', '6-9', '10+'],
    helpText: 'Count hard pulls from credit applications',
  },
  {
    id: 'business_credit_reporting_status', label: 'What is your current business credit profile status?', type: 'select',
    options: ['No profile yet', 'Profile exists, few/no accounts reporting', 'Some accounts reporting', 'Strong profile with multiple accounts'],
    idValues: ['no_profile', 'thin_profile', 'some_reporting', 'strong_profile'],
  },
  {
    id: 'primary_goal', label: 'What is your primary goal?', type: 'select',
    options: ['Access business credit cards', 'Build business credit under EIN', 'Stay ready for funding'],
    idValues: ['business_cards', 'build_ein_credit', 'stay_ready'],
  },
]

export default function AnalyzerPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<AnalyzerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const current = QUESTIONS[step]
  const progress = ((step) / TOTAL_STEPS) * 100

  const setValue = (val: string) => setAnswers({ ...answers, [current.id]: val })
  const currentVal = answers[current.id] || ''

  const handleNext = () => {
    if (!currentVal && current.type !== 'boolean') return
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
    } else {
      submitAnalyzer()
    }
  }

  const submitAnalyzer = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      alert('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Analyzing your profile…</p>
          <p className="text-gray-400 text-sm mt-1">Just a moment</p>
        </div>
      </div>
    )
  }

  if (result) {
    return <AnalyzerResults result={result} businessName={answers.business_name} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">SL</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">SourcifyLending</span>
          </Link>
          <span className="text-sm text-gray-400 font-medium">{step + 1} / {TOTAL_STEPS}</span>
        </div>
        <div className="max-w-xl mx-auto mt-3">
          <ProgressBar value={progress} size="sm" />
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl">
          <div className="card shadow-sm">
            <div className="mb-2">
              <span className="text-xs font-semibold text-green-500 uppercase tracking-wide">
                Question {step + 1} of {TOTAL_STEPS}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">{current.label}</h2>
            {current.helpText && (
              <p className="text-sm text-gray-400 mb-5">{current.helpText}</p>
            )}
            {!current.helpText && <div className="mb-5" />}

            {/* Text input */}
            {current.type === 'text' && (
              <input
                type="text"
                className="input-field text-base"
                placeholder={current.placeholder}
                value={currentVal}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && currentVal && handleNext()}
                autoFocus
              />
            )}

            {/* Boolean */}
            {current.type === 'boolean' && (
              <div className="grid grid-cols-2 gap-3">
                {['Yes', 'No'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setValue(opt === 'Yes' ? 'true' : 'false'); }}
                    className={`py-4 px-5 rounded-xl border-2 font-semibold text-base transition-all ${
                      currentVal === (opt === 'Yes' ? 'true' : 'false')
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Select */}
            {current.type === 'select' && (
              <div className="space-y-2.5">
                {(current.options || []).map((opt, i) => {
                  const val = current.idValues ? current.idValues[i] : opt
                  return (
                    <button
                      key={opt}
                      onClick={() => setValue(val)}
                      className={`w-full text-left py-3.5 px-4 rounded-xl border-2 font-medium text-sm transition-all flex items-center justify-between group ${
                        currentVal === val
                          ? 'border-green-600 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-700 hover:border-green-200 hover:bg-green-50/50'
                      }`}
                    >
                      <span>{opt}</span>
                      {currentVal === val && <CheckCircle size={16} className="text-green-600" />}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-2"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                onClick={handleNext}
                disabled={!currentVal && current.type !== 'boolean'}
                className="btn-primary px-7 py-3"
              >
                {step === TOTAL_STEPS - 1 ? 'Get Results' : 'Next'}
                {step < TOTAL_STEPS - 1 && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Results Component ────────────────────────────────────────────────────────
function AnalyzerResults({ result, businessName }: { result: AnalyzerResult; businessName?: string }) {
  const readinessIcon = {
    Ready: <CheckCircle size={24} className="text-green-600" />,
    'Conditionally Ready': <AlertTriangle size={24} className="text-yellow-600" />,
    'Not Ready': <XCircle size={24} className="text-red-600" />,
  }[result.readiness_status]

  const programNames: Record<string, string> = {
    program_a: 'Program A — 0% Intro APR Card Strategy',
    program_b: 'Program B — Business Credit Builder',
    program_c: 'Program C — Capital Monitoring Membership',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">SL</span>
          </div>
          <span className="font-bold text-gray-900 text-sm">SourcifyLending Analyzer Results</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Readiness Card */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-gray-50 mt-0.5">{readinessIcon}</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Readiness Status</p>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-gray-900">{result.readiness_status}</h2>
                <StatusBadge status={result.readiness_status} />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{result.summary}</p>
            </div>
          </div>
        </div>

        {/* Program Recommendation */}
        <div className="card border-2 border-green-200 bg-green-50/40">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">Recommended Program</p>
          <h3 className="text-lg font-bold text-green-900 mb-2">{programNames[result.assigned_program]}</h3>
          <p className="text-sm text-green-700 leading-relaxed">{result.recommendation}</p>
        </div>

        {/* Risk Flags */}
        {result.risk_flags.length > 0 && (
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" />
              Risk Flags Identified ({result.risk_flags.length})
            </h3>
            <ul className="space-y-2">
              {result.risk_flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="card bg-green-600 border-0 text-center py-8">
          <h3 className="text-xl font-bold text-white mb-2">
            Ready to Start{businessName ? `, ${businessName}` : ''}?
          </h3>
          <p className="text-green-200 text-sm mb-6 max-w-sm mx-auto">
            Join the portal to access your AI fulfillment agent, task roadmap, document manager, and full program execution.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-green-600 font-bold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors">
            Start Your Program <ChevronRight size={18} />
          </Link>
          <p className="mt-4 text-green-300 text-xs">Already have an account? <Link href="/login" className="text-white underline">Sign in</Link></p>
        </div>

        <p className="text-xs text-gray-400 text-center leading-relaxed px-4">
          This analysis is for informational purposes only. SourcifyLending does not guarantee approvals, credit limits, or funding outcomes. Individual results vary based on lender criteria and market conditions.
        </p>
      </main>
    </div>
  )
}
