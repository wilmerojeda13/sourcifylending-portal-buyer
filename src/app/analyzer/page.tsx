'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, XCircle, ChevronRight, Lock, Eye, EyeOff, CalendarDays, Sparkles, BadgeDollarSign, Target, ShieldAlert } from 'lucide-react'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import PublicLegalLinks from '@/components/compliance/PublicLegalLinks'
import PublicMessagingConsent from '@/components/compliance/PublicMessagingConsent'
import TurnstileWidget from '@/components/compliance/TurnstileWidget'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import type { AnalyzerResult } from '@/types'
import { CRM_INVITE_COOKIE } from '@/lib/crm-invites'
import {
  CompliancePayload,
  CONSENT_TEXT_VERSION,
  REQUIRED_MESSAGING_DISCLOSURE,
} from '@/lib/public-form-compliance'

const TOTAL_STEPS = 11
const CRM_ANALYZER_SESSION_COOKIE = 'crm_analyzer_session'

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

// Extended result type returned from the API (includes lead_id)
interface AnalyzerApiResult extends AnalyzerResult {
  lead_id: string | null
}

export default function AnalyzerPage() {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const crmInviteId = searchParams.get('crm_invite')
  const analyzerSessionId = searchParams.get(CRM_ANALYZER_SESSION_COOKIE)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<AnalyzerApiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasTrackedAnalyzerStart, setHasTrackedAnalyzerStart] = useState(false)

  // Logged-in user state
  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string; assignedProgram?: string } | null>(null)

  // Contact gate state (only used for guests)
  const [showContactGate, setShowContactGate] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contactError, setContactError] = useState('')
  const [contactConsent, setContactConsent] = useState(false)
  const [contactTurnstileToken, setContactTurnstileToken] = useState('')

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, assigned_program')
          .eq('id', user.id)
          .single()
        setLoggedInUser({
          name: profile?.full_name || user.user_metadata?.full_name || '',
          email: profile?.email || user.email || '',
          assignedProgram: profile?.assigned_program || undefined,
        })
      }
    }
    checkAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!crmInviteId) return
    document.cookie = `${CRM_INVITE_COOKIE}=${encodeURIComponent(crmInviteId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
  }, [crmInviteId])

  useEffect(() => {
    if (!analyzerSessionId) return
    document.cookie = `${CRM_ANALYZER_SESSION_COOKIE}=${encodeURIComponent(analyzerSessionId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
    fetch(`/api/analyzer/session/${analyzerSessionId}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'link_opened', metadata: { page: 'analyzer' } }),
    }).catch(() => {})
  }, [analyzerSessionId])

  const current = QUESTIONS[step]
  const progress = (step / TOTAL_STEPS) * 100

  const setValue = (val: string) => {
    setAnswers({ ...answers, [current.id]: val })
    if (!hasTrackedAnalyzerStart && analyzerSessionId) {
      setHasTrackedAnalyzerStart(true)
      fetch(`/api/analyzer/session/${analyzerSessionId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'analyzer_started', metadata: { question_id: current.id } }),
      }).catch(() => {})
    }
  }
  const currentVal = answers[current.id] || ''

  const submitAnalyzer = async (
    name: string,
    userEmail: string,
    userPhone?: string,
    compliance?: CompliancePayload,
    turnstileToken?: string,
  ) => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads/analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name,
          email: userEmail,
          phone: userPhone || undefined,
          turnstileToken: turnstileToken || null,
          business_name: answers.business_name || undefined,
          answers,
          crm_invite_id: crmInviteId || null,
          crm_analyzer_session_id: analyzerSessionId || null,
          compliance,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setContactError(data.error || 'Something went wrong. Please try again.')
      } else {
        setResult(data as AnalyzerApiResult)
        // If user is logged in, trigger AI roadmap generation in the background
        if (loggedInUser) {
          fetch('/api/tasks/generate', { method: 'POST' }).catch(() => {})
        }
      }
    } catch {
      setContactError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  const handleNext = () => {
    if (!currentVal && current.type !== 'boolean') return
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
    } else {
      // All questions answered
      if (loggedInUser) {
        // Logged-in: skip contact gate, submit directly
        submitAnalyzer(loggedInUser.name, loggedInUser.email)
      } else {
        // Guest: show contact gate
        setShowContactGate(true)
      }
    }
  }

  const submitWithContact = async () => {
    setContactError('')
    if (!fullName.trim()) { setContactError('Please enter your full name.'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError('Please enter a valid email address.')
      return
    }
    if (!phone.trim()) { setContactError('Please enter your phone number.'); return }
    if (!contactConsent) { setContactError('SMS consent is required before submitting.'); return }
    await submitAnalyzer(fullName.trim(), email.trim(), phone.trim(), {
      enabled: true,
      form_name: 'public_analyzer_contact_gate',
      page_url: typeof window !== 'undefined' ? window.location.href : '/analyzer',
      timestamp: new Date().toISOString(),
      consent_text_version: CONSENT_TEXT_VERSION,
      disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
      consent_given: true,
    }, contactTurnstileToken)
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
    return (
      <AnalyzerResults
        result={result}
        businessName={answers.business_name}
        leadId={result.lead_id}
        contactEmail={loggedInUser?.email || email}
        contactName={loggedInUser?.name || fullName}
        contactBusinessName={answers.business_name}
        crmInviteId={crmInviteId}
        crmAnalyzerSessionId={analyzerSessionId}
        isLoggedIn={!!loggedInUser}
        loggedInUserName={loggedInUser?.name}
        loggedInAssignedProgram={loggedInUser?.assignedProgram}
      />
    )
  }

  // ─── Contact Gate ────────────────────────────────────────────────────────────
  if (showContactGate) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">SL</span>
              </div>
              <span className="font-bold text-gray-900 text-sm">SourcifyLending</span>
            </Link>
            <span className="text-sm text-green-600 font-semibold">Almost done!</span>
          </div>
          <div className="max-w-xl mx-auto mt-3">
            <ProgressBar value={99} size="sm" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-xl">
            <div className="card shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={14} className="text-green-500" />
                <span className="text-xs font-semibold text-green-500 uppercase tracking-wide">
                  Your results are ready
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Where should we send your analysis?</h2>
              <p className="text-sm text-gray-400 mb-6">
                Enter your info to unlock your credit readiness report and program recommendation. We&apos;ll never spam you.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitWithContact()}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="(555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitWithContact()}
                  />
                </div>

                {contactError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{contactError}</p>
                )}

                <PublicMessagingConsent
                  checked={contactConsent}
                  onChange={setContactConsent}
                />

                <TurnstileWidget token={contactTurnstileToken} onTokenChange={setContactTurnstileToken} />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => { setShowContactGate(false); setContactError('') }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  onClick={submitWithContact}
                  disabled={!fullName.trim() || !email.trim() || !phone.trim() || !contactConsent || !turnstileEnabled || !contactTurnstileToken}
                  className="btn-primary px-7 py-3"
                >
                  View My Results
                  <ChevronRight size={16} />
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                🔒 Your information is private and never sold.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ─── Question Flow ───────────────────────────────────────────────────────────
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
                    onClick={() => { setValue(opt === 'Yes' ? 'true' : 'false') }}
                    className={`py-4 px-5 rounded-xl border-2 font-semibold text-base transition-all ${
                      currentVal === (opt === 'Yes' ? 'true' : 'false')
                        ? 'border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-50/50 dark:hover:bg-green-900/20'
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
                          ? 'border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-50/50 dark:hover:bg-green-900/20'
                      }`}
                    >
                      <span>{opt}</span>
                      {currentVal === val && <CheckCircle size={16} className="text-green-600 dark:text-green-400" />}
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
// PUBLIC_FORM_COMPLIANCE_OK

// ─── Results Component ────────────────────────────────────────────────────────
function AnalyzerResults({
  result,
  businessName,
  leadId,
  contactEmail,
  contactName,
  contactBusinessName,
  crmInviteId,
  crmAnalyzerSessionId,
  isLoggedIn,
  loggedInUserName,
  loggedInAssignedProgram: _loggedInAssignedProgram,
}: {
  result: AnalyzerResult
  businessName?: string
  leadId?: string | null
  contactEmail?: string
  contactName?: string
  contactBusinessName?: string
  crmInviteId?: string | null
  crmAnalyzerSessionId?: string | null
  isLoggedIn?: boolean
  loggedInUserName?: string
  loggedInAssignedProgram?: string
}) {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const router = useRouter()
  const supabase = createClient()

  // Prospect signup state
  const [showSignupForm, setShowSignupForm] = useState(false)
  const [signupPassword, setSignupPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState('')
  const [signupConsent, setSignupConsent] = useState(false)
  const [signupTurnstileToken, setSignupTurnstileToken] = useState('')

  const BOOKING_URL = 'https://calendar.app.google/PGkzpGXXjRHkLHTEA'

  // Save analyzer context to sessionStorage so it can be claimed after OAuth redirect
  const saveAnalyzerToSession = () => {
    try {
      sessionStorage.setItem('pending_analyzer_result', JSON.stringify({
        result,
        lead_id: leadId ?? null,
        contact_email: contactEmail ?? null,
        contact_name: contactName ?? null,
        business_name: contactBusinessName ?? null,
        crm_invite_id: crmInviteId ?? null,
        crm_analyzer_session_id: crmAnalyzerSessionId ?? null,
      }))
    } catch {
      // sessionStorage not available (private mode etc) — safe to ignore
    }
  }

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

  const resultHeadline = `Based on your profile, you may be eligible for an estimated funding range of ${result.estimated_funding_range}.`

  const handleCreateFreeAccount = async () => {
    setSignupError('')
    if (!signupPassword || signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.')
      return
    }
    if (!signupConsent) {
      setSignupError('SMS consent is required before creating the account.')
      return
    }

    setSignupLoading(true)
    try {
      // 1. Create prospect account via API (auto-confirms email)
      const res = await fetch('/api/auth/create-prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contactEmail,
          password: signupPassword,
          full_name: contactName,
          business_name: contactBusinessName || null,
          lead_id: leadId || null,
          analyzer_result: result,
          crm_invite_id: crmInviteId || null,
          crm_analyzer_session_id: crmAnalyzerSessionId || null,
          turnstileToken: signupTurnstileToken,
          compliance: {
            enabled: true,
            form_name: 'public_analyzer_create_account',
            page_url: typeof window !== 'undefined' ? window.location.href : '/analyzer',
            timestamp: new Date().toISOString(),
            consent_text_version: CONSENT_TEXT_VERSION,
            disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
            consent_given: true,
          } satisfies CompliancePayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSignupError(data.error || 'Something went wrong. Please try again.')
        setSignupLoading(false)
        return
      }

      // 2. Sign in immediately (account is auto-confirmed)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: contactEmail!,
        password: signupPassword,
      })

      if (signInError) {
        setSignupError('Account created! Please sign in at /login.')
        setSignupLoading(false)
        return
      }

      // 3. Redirect to prospect dashboard
      router.push('/dashboard')
    } catch {
      setSignupError('Something went wrong. Please try again.')
      setSignupLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">SL</span>
          </div>
          <span className="font-bold text-gray-900 dark:text-white text-sm">SourcifyLending Analyzer Results</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Funding Estimate */}
        <div className="card border-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/40">
          <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">Estimated Funding Range</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-green-900 dark:text-green-300 mb-3 break-words">{result.estimated_funding_range}</h2>
          <p className="text-sm sm:text-base text-green-800 dark:text-green-100 leading-relaxed">{resultHeadline}</p>
          <p className="text-sm text-green-700 dark:text-green-200 mt-3 leading-relaxed">{result.recommended_next_step}</p>
          <p className="text-xs text-green-700/80 dark:text-green-300/80 mt-4 leading-relaxed">{result.disclaimer}</p>
        </div>

        {/* Readiness Card */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 mt-0.5 shrink-0">{readinessIcon}</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Readiness Status</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">{result.readiness_status}</h2>
                <StatusBadge status={result.readiness_status} />
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                <Target size={14} className="text-green-600" />
                Funding Readiness Score: {result.readiness_score}/100
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{result.summary}</p>
            </div>
          </div>
        </div>

        {/* Snapshot Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <BadgeDollarSign size={18} className="text-green-600" />
              <h3 className="font-bold text-gray-900 dark:text-white">Recommended Next Step</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{result.recommended_next_step}</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={18} className="text-yellow-600" />
              <h3 className="font-bold text-gray-900 dark:text-white">Top 3 Funding Blockers</h3>
            </div>
            <ul className="space-y-2">
              {result.top_blockers.map((blocker, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Program Recommendation */}
        <div className="card border-2 border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-950/30">
          <p className="text-xs font-semibold text-green-500 dark:text-green-400 uppercase tracking-wide mb-1">Recommended Program</p>
          <h3 className="text-lg font-bold text-green-900 dark:text-green-300 mb-2">{programNames[result.assigned_program]}</h3>
          <p className="text-sm text-green-700 dark:text-green-200 leading-relaxed">{result.recommendation}</p>
        </div>

        {/* Risk Flags */}
        {result.risk_flags.length > 0 && (
          <div className="card">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" />
              Risk Flags Identified ({result.risk_flags.length})
            </h3>
            <ul className="space-y-2">
              {result.risk_flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── CTA Block ─────────────────────────────────────────────────────── */}
        {isLoggedIn ? (
          /* Logged-in: results saved automatically — go to dashboard */
          <div className="card border-2 border-green-500 bg-white text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={22} className="text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Your analysis has been saved
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-300 mb-4 leading-relaxed">
              {loggedInUserName ? `${loggedInUserName.split(' ')[0]}, your` : 'Your'} results are saved to your account. Head to your dashboard to review your readiness score, blockers, and next steps.
            </p>
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              {result.upgrade_cta} <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          /* Guest: show account creation + secondary CTAs */
          <div className="space-y-3">
            {/* Primary: Create Free Account */}
            <div className="card border-2 border-green-500 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-green-600" />
                <span className="text-xs font-bold text-green-600 uppercase tracking-wide">Free — No Credit Card</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Save Your Results &amp; Unlock Your Next Step
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-300 mb-4 leading-relaxed">
                Create a free account to save your analysis, review your estimated funding range, and continue into {programNames[result.assigned_program].split('—')[0].trim()}.
              </p>

              {!showSignupForm ? (
                <div className="space-y-3">
                  <div onClick={saveAnalyzerToSession}>
                    <GoogleSignInButton
                      redirectTo="/dashboard"
                      label="Continue with Google — Free"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <button
                    onClick={() => setShowSignupForm(true)}
                    className="btn-primary w-full py-3.5 text-base"
                  >
                    {result.upgrade_cta} <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <span className="font-medium text-gray-900 dark:text-white truncate">{contactEmail}</span>
                    <span className="text-gray-400 shrink-0">· pre-filled</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="input-field pr-12"
                      placeholder="Choose a password (min 8 chars)"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateFreeAccount()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {signupError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{signupError}</p>
                  )}
                  <PublicMessagingConsent
                    checked={signupConsent}
                    onChange={setSignupConsent}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  />
                  <TurnstileWidget token={signupTurnstileToken} onTokenChange={setSignupTurnstileToken} />
                  <button
                    onClick={handleCreateFreeAccount}
                    disabled={signupLoading || signupPassword.length < 8 || !signupConsent || !turnstileEnabled || !signupTurnstileToken}
                    className="btn-primary w-full py-3.5"
                  >
                    {signupLoading ? 'Creating account…' : `${result.upgrade_cta} →`}
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    Already have an account?{' '}
                    <Link href="/login" className="text-green-600 font-semibold">Sign in</Link>
                  </p>
                </div>
              )}
            </div>

            {/* Secondary CTAs side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Book a Call */}
              {BOOKING_URL ? (
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/30 dark:hover:bg-green-950/30 transition-all group text-center py-5"
                >
                  <CalendarDays size={22} className="text-green-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Book on Google Calendar</p>
                  <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Talk to an advisor about your results</p>
                </a>
              ) : (
                <div className="card border border-gray-200 dark:border-gray-700 text-center py-5">
                  <CalendarDays size={22} className="text-gray-300 mx-auto mb-2" />
                  <p className="font-bold text-gray-400 text-sm">Google Calendar</p>
                  <p className="text-xs text-gray-400 mt-1">Coming soon</p>
                </div>
              )}

              {/* Join Paid Program */}
              <Link
                href="/signup"
                className="card border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/30 dark:hover:bg-green-950/30 transition-all group text-center py-5"
              >
                <ChevronRight size={22} className="text-green-600 mx-auto mb-2 group-hover:translate-x-0.5 transition-transform" />
                <p className="font-bold text-gray-900 dark:text-white text-sm">{result.upgrade_cta}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Full program access</p>
              </Link>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed px-4">
          {result.disclaimer} SourcifyLending does not guarantee approvals, credit limits, or funding outcomes.
        </p>
      </main>
    </div>
  )
}
