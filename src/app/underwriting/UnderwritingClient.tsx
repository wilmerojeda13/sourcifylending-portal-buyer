'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Lock,
  ClipboardList, Building2, CreditCard, DollarSign, BarChart3,
  ShieldCheck, TrendingUp, FileText, Sparkles,
} from 'lucide-react'
import type { UserProfile } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  profile: UserProfile
}

// ─── Answer state ─────────────────────────────────────────────────────────────
type Answers = Record<string, string | boolean | number>

// ─── Step definition ──────────────────────────────────────────────────────────
interface FormField {
  id: string
  label: string
  helpText?: string
  type: 'select' | 'boolean' | 'text' | 'info'
  options?: string[]
  required: boolean
  placeholder?: string
}

interface FormStep {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  programs: ('program_a' | 'program_b' | 'all')[]
  fields: FormField[]
}

// ─── Step Definitions ─────────────────────────────────────────────────────────

const STEPS: FormStep[] = [
  // ── Step 1: Business Identity (both programs) ────────────────────────────────
  {
    id: 'business_identity',
    title: 'Business Identity',
    subtitle: 'Confirm your business information for underwriting.',
    icon: <Building2 size={22} className="text-green-600" />,
    programs: ['all'],
    fields: [
      {
        id: 'uw_legal_name',
        label: 'Legal Business Name',
        type: 'text',
        placeholder: 'As registered with your state',
        required: true,
      },
      {
        id: 'uw_entity_type',
        label: 'Entity Type',
        type: 'select',
        options: ['LLC', 'S-Corp', 'C-Corp', 'Sole Proprietorship', 'Partnership', 'Non-Profit', 'Other'],
        required: true,
      },
      {
        id: 'uw_time_in_business_conf',
        label: 'How long has your business been operating?',
        type: 'select',
        options: ['Less than 6 months', '6–12 months', '1–2 years', '2–5 years', '5+ years'],
        required: true,
      },
    ],
  },

  // ── Step 2: Program B — Business Credit Info ──────────────────────────────────
  {
    id: 'business_credit_profile',
    title: 'Business Credit Profile',
    subtitle: 'Tell us about your current business credit standing.',
    icon: <ClipboardList size={22} className="text-green-600" />,
    programs: ['program_b'],
    fields: [
      {
        id: 'uw_ein',
        label: 'EIN (Employer Identification Number)',
        type: 'text',
        placeholder: 'XX-XXXXXXX',
        helpText: 'Used to verify your business identity. Enter exactly as issued by the IRS.',
        required: true,
      },
      {
        id: 'uw_business_state',
        label: 'State of Formation',
        type: 'select',
        options: [
          'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
          'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
          'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
          'VA','WA','WV','WI','WY','DC',
        ],
        required: true,
      },
      {
        id: 'uw_duns_status',
        label: 'Do you have a D&B D-U-N-S Number?',
        type: 'select',
        options: ['No — I need to get one', 'In progress / pending', 'Yes — it\'s active'],
        helpText: 'A D-U-N-S number is required for most business credit accounts. Free to obtain at dnb.com.',
        required: true,
      },
      {
        id: 'uw_experian_biz_exists',
        label: 'Do you have an Experian Business credit file?',
        type: 'boolean',
        helpText: 'A business file is created when a creditor reports to Experian Business on your EIN.',
        required: true,
      },
      {
        id: 'uw_tradelines_count',
        label: 'How many active business credit tradelines do you currently have?',
        type: 'select',
        options: ['0 — none yet', '1–2', '3–5', '6–8', '9 or more'],
        helpText: 'Count only accounts that actively report to D&B, Experian Business, or Equifax Business.',
        required: true,
      },
    ],
  },

  // ── Step 3: Program A — Personal Credit Profile ───────────────────────────────
  {
    id: 'personal_credit_profile',
    title: 'Personal Credit Profile',
    subtitle: 'Your personal credit profile determines which 0% APR cards you qualify for.',
    icon: <CreditCard size={22} className="text-blue-600" />,
    programs: ['program_a'],
    fields: [
      {
        id: 'uw_total_credit_limit',
        label: 'Total available credit limit across all personal cards',
        type: 'select',
        options: ['$0 — no cards yet', '$1 – $5,000', '$5,001 – $15,000', '$15,001 – $30,000', '$30,001 – $60,000', '$60,000+'],
        required: true,
      },
      {
        id: 'uw_existing_card_balances',
        label: 'Total balances currently owed across all cards',
        type: 'select',
        options: ['$0', '$1 – $2,500', '$2,501 – $7,500', '$7,501 – $15,000', '$15,000+'],
        required: true,
      },
      {
        id: 'uw_monthly_income',
        label: 'Monthly personal/household income',
        type: 'select',
        options: ['Under $3,000', '$3,000 – $6,000', '$6,001 – $10,000', '$10,001 – $20,000', '$20,000+'],
        helpText: 'Card issuers use income to set credit limits. Use gross monthly income.',
        required: true,
      },
      {
        id: 'uw_negative_accounts',
        label: 'Any negative accounts on your personal credit? (collections, charge-offs, late payments)',
        type: 'boolean',
        required: true,
      },
      {
        id: 'uw_authorized_user_status',
        label: 'Are you an authorized user on anyone else\'s credit card accounts?',
        type: 'boolean',
        helpText: 'Being an AU on accounts with good history can boost your score.',
        required: false,
      },
      {
        id: 'uw_card_application_strategy',
        label: 'Preferred application approach',
        type: 'select',
        options: [
          'Apply to one issuer at a time (conservative)',
          'Spread across 2–3 issuers on the same day (velocity)',
          'Maximize one bank then rotate to others',
        ],
        helpText: 'Our AI will optimize this based on your profile, but your preference helps us calibrate.',
        required: false,
      },
    ],
  },

  // ── Step 4: Revenue & Banking (both programs) ─────────────────────────────────
  {
    id: 'revenue_and_banking',
    title: 'Revenue & Banking',
    subtitle: 'Your financial activity is the foundation of every funding decision.',
    icon: <DollarSign size={22} className="text-green-600" />,
    programs: ['all'],
    fields: [
      {
        id: 'uw_annual_revenue_conf',
        label: 'Annual business revenue (estimated)',
        type: 'select',
        options: ['Under $30,000', '$30,000 – $100,000', '$100,001 – $250,000', '$250,001 – $500,000', '$500,000 – $1M', '$1M+'],
        required: true,
      },
      {
        id: 'uw_average_daily_balance',
        label: 'Average daily balance in your primary business bank account',
        type: 'select',
        options: ['Under $1,000', '$1,000 – $5,000', '$5,001 – $15,000', '$15,001 – $50,000', '$50,000+'],
        required: true,
      },
      {
        id: 'uw_bank_statement_months',
        label: 'How many months of bank statements do you have available?',
        type: 'select',
        options: ['Less than 1 month', '1–2 months', '3 months', '4–6 months', '6+ months'],
        helpText: 'Most lenders require 3–6 months of statements. Upload them to Documents when prompted.',
        required: true,
      },
      {
        id: 'uw_outstanding_balances',
        label: 'Total outstanding business + personal debt (loans, lines of credit, cards)',
        type: 'select',
        options: ['Under $10,000', '$10,000 – $30,000', '$30,001 – $75,000', '$75,001 – $150,000', '$150,000+'],
        required: true,
      },
    ],
  },

  // ── Step 5: Risk Factors (both programs) ─────────────────────────────────────
  {
    id: 'risk_factors',
    title: 'Risk Factors',
    subtitle: 'These factors directly affect your underwriting outcome. Answer honestly.',
    icon: <ShieldCheck size={22} className="text-gray-600" />,
    programs: ['all'],
    fields: [
      {
        id: 'uw_recent_derogatory',
        label: 'Any collections, charge-offs, or late payments in the last 24 months?',
        type: 'boolean',
        helpText: 'This includes personal AND business credit. Recent derogatory marks significantly affect approval odds.',
        required: true,
      },
      {
        id: 'uw_public_records',
        label: 'Any open tax liens, court judgments, or active bankruptcies?',
        type: 'boolean',
        helpText: 'Open public records are a disqualifying factor. Discharged bankruptcies 2+ years ago typically are not.',
        required: true,
      },
    ],
  },

  // ── Step 6: Program B — Business Debt ─────────────────────────────────────────
  {
    id: 'business_debts',
    title: 'Existing Business Obligations',
    subtitle: 'Help us understand your current business debt load.',
    icon: <BarChart3 size={22} className="text-green-600" />,
    programs: ['program_b'],
    fields: [
      {
        id: 'uw_ein_open_date',
        label: 'When was your EIN business bank account opened?',
        type: 'select',
        options: ['Not yet opened', 'Less than 3 months ago', '3–6 months ago', '6–12 months ago', '1–2 years ago', '2+ years ago'],
        helpText: 'Business bank account age is a key factor lenders use to verify business legitimacy.',
        required: true,
      },
      {
        id: 'uw_vendor_tier_readiness',
        label: 'Which tier of business credit accounts do you currently have?',
        type: 'select',
        options: [
          'None yet — starting from zero',
          'Tier 1 only (starter net-30 vendors)',
          'Tier 1 + some store/fleet accounts',
          'Multiple tiers across D&B, Experian, and Equifax',
        ],
        required: true,
      },
      {
        id: 'uw_existing_biz_debts',
        label: 'Total active business loans or lines of credit',
        type: 'select',
        options: ['$0 — none', 'Under $5,000', '$5,000 – $25,000', '$25,001 – $100,000', '$100,000+'],
        required: true,
      },
    ],
  },

  // ── Step 7: Agreement & Submit (both programs) ────────────────────────────────
  {
    id: 'agreement',
    title: 'Review & Submit',
    subtitle: 'Confirm your answers and complete your underwriting review.',
    icon: <CheckCircle size={22} className="text-green-600" />,
    programs: ['all'],
    fields: [
      {
        id: 'cert_accurate',
        label: 'I certify that all information I have provided is accurate to the best of my knowledge.',
        type: 'boolean',
        required: true,
      },
      {
        id: 'cert_consent',
        label: 'I understand that SourcifyLending will use this information to personalize my program deliverables and funding recommendations.',
        type: 'boolean',
        required: true,
      },
    ],
  },
]

// ─── Tradeline count parser ───────────────────────────────────────────────────
function parseTradelineCount(val: string | boolean | number | undefined): number {
  if (typeof val === 'number') return val
  const s = String(val ?? '0')
  if (s.includes('9 or more')) return 9
  if (s.startsWith('6–8') || s.startsWith('6-8')) return 7
  if (s.startsWith('3–5') || s.startsWith('3-5')) return 4
  if (s.startsWith('1–2') || s.startsWith('1-2')) return 1
  return 0
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UnderwritingClient({ profile }: Props) {
  const router = useRouter()
  const program = profile.assigned_program as 'program_a' | 'program_b'

  // Filter steps for this program
  const visibleSteps = STEPS.filter(
    s => s.programs.includes('all') || s.programs.includes(program)
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>(() => ({
    uw_legal_name: profile.business_name ?? '',
    uw_entity_type: profile.entity_type ?? '',
  }))
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [complete, setComplete] = useState(false)
  const [uwResult, setUwResult] = useState<{
    approval_likelihood: string
    risk_level: string
    estimated_funding_range: string | null
    determined_stage: string | null
    ai_summary: string | null
    ai_recommendations: string[]
    disqualified: boolean
    disqualification_reason: string | null
  } | null>(null)

  const currentStep = visibleSteps[stepIndex]
  const totalSteps = visibleSteps.length
  const progress = Math.round(((stepIndex) / totalSteps) * 100)

  // ── Field change ─────────────────────────────────────────────────────────────
  const handleChange = useCallback((fieldId: string, value: string | boolean | number) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  // ── Validation for current step ───────────────────────────────────────────────
  const stepIsValid = useCallback((): boolean => {
    for (const field of currentStep.fields) {
      if (!field.required) continue
      const val = answers[field.id]
      if (field.type === 'boolean') {
        if (val === undefined || val === null || val === '') return false
        // For certification fields (cert_*) only true is valid
        if (field.id.startsWith('cert_') && val !== true) return false
      } else {
        if (!val || String(val).trim() === '') return false
      }
    }
    return true
  }, [currentStep, answers])

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goNext = () => {
    if (stepIndex < totalSteps - 1) setStepIndex(i => i + 1)
  }
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')

    // Coerce tradeline select string to number for the scorer
    const finalAnswers = {
      ...answers,
      uw_tradelines_count: parseTradelineCount(answers.uw_tradelines_count),
    }

    try {
      const res = await fetch('/api/underwriting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      setUwResult(data)
      setComplete(true)
    } catch {
      setSubmitError('Network error — please check your connection and try again.')
      setSubmitting(false)
    }
  }

  // ─── Complete Screen ─────────────────────────────────────────────────────────
  if (complete && uwResult) {
    const isDisqualified = uwResult.disqualified
    const likelihoodConfig: Record<string, { bg: string; text: string; badge: string; icon: string }> = {
      high:         { bg: 'bg-green-50 border-green-200',  text: 'text-green-700', badge: 'bg-green-600', icon: '✅' },
      medium:       { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-500', icon: '⚠️' },
      low:          { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-500', icon: '🔶' },
      disqualified: { bg: 'bg-red-50 border-red-200',      text: 'text-red-700',    badge: 'bg-red-600',    icon: '🚧' },
    }
    const lc = likelihoodConfig[uwResult.approval_likelihood] ?? likelihoodConfig.medium
    const likelihoodLabel: Record<string, string> = {
      high:         'Strong Approval Likelihood',
      medium:       'Moderate Approval Likelihood',
      low:          'Lower Approval Likelihood — Action Required',
      disqualified: 'Additional Steps Required Before Proceeding',
    }

    return (
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={30} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Underwriting Complete!</h1>
          <p className="text-gray-500 text-sm">
            Your profile has been analyzed. Here&apos;s your funding readiness summary.
          </p>
        </div>

        {/* Outcome badge */}
        <div className={`border rounded-2xl p-5 mb-4 ${lc.bg}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Underwriting Outcome</p>
          <p className={`text-lg font-bold ${lc.text}`}>
            {likelihoodConfig[uwResult.approval_likelihood]?.icon} {likelihoodLabel[uwResult.approval_likelihood]}
          </p>
          <div className="flex flex-wrap gap-3 mt-3 text-xs font-semibold">
            <span className={`${lc.badge} text-white px-3 py-1 rounded-full`}>
              Risk Level: {uwResult.risk_level}
            </span>
            {uwResult.estimated_funding_range && (
              <span className="bg-gray-700 text-white px-3 py-1 rounded-full">
                Est. Range: {uwResult.estimated_funding_range}
              </span>
            )}
            {uwResult.determined_stage && (
              <span className="bg-green-700 text-white px-3 py-1 rounded-full">
                Stage: {uwResult.determined_stage}
              </span>
            )}
          </div>
        </div>

        {/* Disqualification reason */}
        {isDisqualified && uwResult.disqualification_reason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex gap-3">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">What this means</p>
              <p className="text-sm text-red-600">{uwResult.disqualification_reason}</p>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {uwResult.ai_summary && (
          <div className="card mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Sparkles size={13} />AI Analysis
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{uwResult.ai_summary}</p>
          </div>
        )}

        {/* Recommendations */}
        {uwResult.ai_recommendations.length > 0 && (
          <div className="card mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp size={13} />Your Next Steps
            </p>
            <div className="space-y-2.5">
              {uwResult.ai_recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-green-700">
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bank statement upload nudge for Program B */}
        {program === 'program_b' && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex gap-3">
            <FileText size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-1">Upload Your Bank Statements</p>
              <p className="text-sm text-blue-600">
                Upload your last 3–4 months of business bank statements in the Documents section.
                This unlocks your full AI analysis and helps lenders verify your financials.
              </p>
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-primary w-full py-3.5 inline-flex items-center justify-center gap-2 text-sm font-bold"
        >
          <TrendingUp size={16} />
          Go to My Funding Dashboard
        </button>

        {/* Legal */}
        <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
          All recommendations are based on the information you provided during your profile analysis.
          SourcifyLending does not guarantee approvals, credit limits, or funding outcomes.
        </p>
      </div>
    )
  }

  // ─── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
            <Lock size={14} className="text-green-600" />
          </div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Step 1: Unlock Your Funding Plan
          </span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Underwriting Review</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {program === 'program_a' ? '0% Intro APR Card Strategy' : 'Business Credit Builder'}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <span className="text-xs font-semibold text-green-600">{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-2 bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(progress, 5)}%` }}
          />
        </div>
      </div>

      {/* Step Card */}
      <div className="card mb-5">
        {/* Step header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
            {currentStep.icon}
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base">{currentStep.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5 leading-snug">{currentStep.subtitle}</p>
          </div>
        </div>

        {/* Risk warning for risk_factors step */}
        {currentStep.id === 'risk_factors' && (answers.uw_recent_derogatory === true || answers.uw_public_records === true) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5 flex gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Noted.</strong> These factors will be reflected in your underwriting result.
              Be as accurate as possible — our AI uses this to identify your best path forward.
            </p>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-5">
          {currentStep.fields.map(field => (
            <FieldRenderer
              key={field.id}
              field={field}
              value={answers[field.id]}
              onChange={handleChange}
              program={program}
            />
          ))}
        </div>

        {submitError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {stepIndex > 0 && (
          <button
            onClick={goBack}
            className="btn-secondary flex items-center gap-1.5 px-5 py-3"
          >
            <ChevronLeft size={16} />
            Back
          </button>
        )}

        {stepIndex < totalSteps - 1 ? (
          <button
            onClick={goNext}
            disabled={!stepIsValid()}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !stepIsValid()}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing your profile…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Complete Underwriting Review
              </>
            )}
          </button>
        )}
      </div>

      {/* Legal */}
      <p className="text-center text-xs text-gray-400 mt-5 leading-relaxed">
        All information is stored securely and used only to personalize your program deliverables.
        SourcifyLending does not guarantee approvals or funding outcomes.
      </p>
    </div>
  )
}

// ─── Field Renderer ───────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
  program,
}: {
  field: FormField
  value: string | boolean | number | undefined
  onChange: (id: string, val: string | boolean | number) => void
  program: 'program_a' | 'program_b'
}) {
  // Certification booleans render as checkboxes
  const isCert = field.id.startsWith('cert_')

  if (field.type === 'boolean' && isCert) {
    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={value === true}
          onChange={e => onChange(field.id, e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-green-600 shrink-0 cursor-pointer"
        />
                    <span className="text-sm text-gray-700 leading-relaxed group-hover:text-green-700 transition-colors">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </span>
      </label>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        {field.helpText && (
          <p className="text-xs text-gray-400 mb-2.5 leading-relaxed">{field.helpText}</p>
        )}
        <div className="flex gap-3">
          {['Yes', 'No'].map(opt => {
            const isYes = opt === 'Yes'
            const selected = value === isYes
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(field.id, isYes)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all
                  ${selected
                    ? isYes
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.helpText && (
          <p className="text-xs text-gray-400 mb-2 leading-relaxed">{field.helpText}</p>
        )}
        <select
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={e => onChange(field.id, e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent bg-white"
        >
          <option value="">Select an option…</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  // text
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.helpText && (
        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{field.helpText}</p>
      )}
      <input
        type="text"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={e => onChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
      />
      {/* Suppress unused program variable warning */}
      <span className="hidden">{program}</span>
    </div>
  )
}
