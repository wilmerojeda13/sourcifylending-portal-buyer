'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, XCircle, ChevronRight, Lock, Eye, EyeOff, CalendarDays, Sparkles } from 'lucide-react'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import type { AnalyzerResult } from '@/types'

const TOTAL_STEPS = 11

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
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<AnalyzerApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  // Logged-in user state
  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string; assignedProgram?: string } | null>(null)

  // Contact gate state (only used for guests)
  const [showContactGate, setShowContactGate] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contactError, setContactError] = useState('')

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

  const current = QUESTIONS[step]
  const progress = (step / TOTAL_STEPS) * 100

  const setValue = (val: string) => setAnswers({ ...answers, [current.id]: val })
  const currentVal = answers[current.id] || ''

  const submitAnalyzer = async (name: string, userEmail: string, userPhone?: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads/analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name,
          email: userEmail,
          phone: userPhone || undefined,
          business_name: answers.business_name || undefined,
          answers,
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
    await submitAnalyzer(fullName.trim(), email.trim(), phone.trim() || undefined)
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
                Enter your info to unlock your credit readiness report and program recommendation. We'll never spam you.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
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
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
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
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Phone Number <span className="text-gray-400 font-normal">(optional)</span>
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
                  disabled={!fullName.trim() || !email.trim()}
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
function AnalyzerResults({
  result,
  businessName,
  leadId,
  contactEmail,
  contactName,
  contactBusinessName,
  isLoggedIn,
  loggedInUserName,
}: {
  result: AnalyzerResult
  businessName?: string
  leadId?: string | null
  contactEmail?: string
  contactName?: string
  contactBusinessName?: string
  isLoggedIn?: boolean
  loggedInUserName?: string
  loggedInAssignedProgram?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  // Prospect signup state
  const [showSignupForm, setShowSignupForm] = useState(false)
  const [signupPassword, setSignupPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState('')

  const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || null

  // Save analyzer context to sessionStorage so it can be claimed after OAuth redirect
  const saveAnalyzerToSession = () => {
    try {
      sessionStorage.setItem('pending_analyzer_result', JSON.stringify({
        result,
        lead_id: leadId ?? null,
        contact_email: contactEmail ?? null,
        contact_name: contactName ?? null,
        business_name: contactBusinessName ?? null,
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

  const handleCreateFreeAccount = async () => {
    setSignupError('')
    if (!signupPassword || signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.')
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

        {/* ─── CTA Block ─────────────────────────────────────────────────────── */}
        {isLoggedIn ? (
          /* Logged-in: results saved automatically — go to dashboard */
          <div className="card border-2 border-green-500 bg-white text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={22} className="text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Your analysis has been saved
            </h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              {loggedInUserName ? `${loggedInUserName.split(' ')[0]}, your` : 'Your'} results are saved to your account and your AI roadmap is being generated. Head to your dashboard to see your next steps.
            </p>
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              Go to My Dashboard <ArrowRight size={16} />
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
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Save Your Results &amp; Access Your Free Portal
              </h3>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                Create a free account to save your analysis, see your personalized roadmap preview, and access your prospect dashboard.
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
                    Create with Email <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="font-medium text-gray-900 truncate">{contactEmail}</span>
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
                  <button
                    onClick={handleCreateFreeAccount}
                    disabled={signupLoading || signupPassword.length < 8}
                    className="btn-primary w-full py-3.5"
                  >
                    {signupLoading ? 'Creating account…' : 'Enter My Portal →'}
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
                  className="card border border-gray-200 hover:border-green-300 hover:bg-green-50/30 transition-all group text-center py-5"
                >
                  <CalendarDays size={22} className="text-green-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-gray-900 text-sm">Book a Strategy Call</p>
                  <p className="text-xs text-gray-500 mt-1">Talk to an advisor about your results</p>
                </a>
              ) : (
                <div className="card border border-gray-200 text-center py-5">
                  <CalendarDays size={22} className="text-gray-300 mx-auto mb-2" />
                  <p className="font-bold text-gray-400 text-sm">Strategy Call</p>
                  <p className="text-xs text-gray-400 mt-1">Coming soon</p>
                </div>
              )}

              {/* Join Paid Program */}
              <Link
                href="/signup"
                className="card border border-gray-200 hover:border-green-300 hover:bg-green-50/30 transition-all group text-center py-5"
              >
                <ChevronRight size={22} className="text-green-600 mx-auto mb-2 group-hover:translate-x-0.5 transition-transform" />
                <p className="font-bold text-gray-900 text-sm">Start {programNames[result.assigned_program].split('—')[0].trim()}</p>
                <p className="text-xs text-gray-500 mt-1">Full program access</p>
              </Link>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center leading-relaxed px-4">
          This analysis is for informational purposes only. SourcifyLending does not guarantee approvals, credit limits, or funding outcomes. Individual results vary based on lender criteria and market conditions.
        </p>
      </main>
    </div>
  )
}
