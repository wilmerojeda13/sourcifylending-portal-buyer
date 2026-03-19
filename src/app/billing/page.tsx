'use client'
import { useState, useEffect } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { CreditCard, CheckCircle, Shield, Loader2, ArrowRightLeft, Zap, Building2, BarChart3, Calendar, AlertCircle } from 'lucide-react'
import type { UserProfile } from '@/types'
import toast from 'react-hot-toast'

interface PaymentArrangement {
  setup_fee_total: number
  setup_fee_paid: number
  setup_fee_remaining: number
  recurring_amount: number
  next_amount_due: number | null
  next_due_date: string | null
}

const PLAN_FEATURES: Record<string, string[]> = {
  program_a: [
    'Full 0% APR Card Strategy program',
    'AI Fulfillment Agent — full access',
    'Application sequencing guidance',
    'Card acquisition tracking',
    'Optimization stage support',
    'Document manager',
    'Report generation',
  ],
  program_b: [
    'Full Business Credit Builder program',
    'AI Fulfillment Agent — full access',
    'Vendor account guidance',
    'Tradeline progress tracking',
    'PAYDEX preparation support',
    'Document manager',
    'Monthly reports',
  ],
  program_c: [
    'Monthly Capital Monitoring',
    'AI Fulfillment Agent — full access',
    'Monthly credit snapshot',
    'Banking analysis',
    'Obligation risk scan',
    '30-day action plan',
    'Do/Don\'t monthly rules',
  ],
}

const PLAN_PRICES: Record<string, string> = {
  program_a: '$399/month',
  program_b: '$199/month',
  program_c: '$97/month',
}

const PLAN_NAMES: Record<string, string> = {
  program_a: 'Program A — 0% APR Card Strategy',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring',
}

export default function BillingPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [changingPlan, setChangingPlan] = useState<string | null>(null)
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [selectingPlan, setSelectingPlan] = useState<string | null>(null)
  const [showProgramSwitch, setShowProgramSwitch] = useState(false)
  const [arrangement, setArrangement] = useState<PaymentArrangement | null>(null)
  const [totalPaid, setTotalPaid] = useState<number>(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { data: sub }, { data: arr }, { data: records }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).single(),
        supabase.from('payment_arrangements').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
        supabase.from('payment_records').select('amount').eq('user_id', user.id),
      ])
      setProfile(p)
      setStripeCustomerId(sub?.stripe_customer_id ?? null)
      setArrangement(arr ?? null)
      setTotalPaid((records ?? []).reduce((sum, r) => sum + Number(r.amount), 0))
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
  const canManageBilling = isActive && !!stripeCustomerId
  const canChangePlan = isActive

  const handleSubscribe = () => {
    window.location.href = '/enroll'
  }

  const handleSelectAndEnroll = async (selectedProgram: string) => {
    setSelectingPlan(selectedProgram)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('Please log in first'); return }
      const { error } = await supabase
        .from('profiles')
        .update({ assigned_program: selectedProgram, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) { toast.error('Failed to select program. Please try again.'); return }
      window.location.href = '/enroll'
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSelectingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to open billing portal')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setPortalLoading(false)
  }

  const handleChangePlan = async (newProgram: string) => {
    if (!confirm(`Switch to ${PLAN_NAMES[newProgram]}? Your billing will be prorated immediately.`)) return
    setChangingPlan(newProgram)
    try {
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_program: newProgram }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Plan changed to ${PLAN_NAMES[newProgram]}`)
        setProfile((p) => p ? { ...p, assigned_program: newProgram } : p)
        setShowChangePlan(false)
      } else {
        toast.error(data.error || 'Failed to change plan')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setChangingPlan(null)
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-48 bg-gray-200 rounded-2xl" />
        </div>
      </PortalLayout>
    )
  }

  const program = profile?.assigned_program || null
  const features = program ? PLAN_FEATURES[program] : []
  const price = program ? PLAN_PRICES[program] : ''

  const otherPrograms = Object.keys(PLAN_NAMES).filter((p) => p !== program)

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
    >
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <CreditCard size={24} className="text-green-500" />
          Billing & Subscription
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage your SourcifyLending membership</p>
      </div>

      {/* Current Status */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Subscription Status</p>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={profile?.subscription_status || 'inactive'} />
              <span className="font-bold text-gray-900">{getProgramShortLabel(program)}</span>
            </div>
            {price && <p className="text-2xl font-bold text-green-600">{price}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canChangePlan && (
              <button
                onClick={() => setShowChangePlan((v) => !v)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <ArrowRightLeft size={14} />
                Change Plan
              </button>
            )}
            {canManageBilling ? (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="btn-secondary text-sm"
              >
                {portalLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Manage Subscription
              </button>
            ) : null}
          </div>
        </div>

        {!isActive && (
          <div className="mt-4 pt-4 border-t border-gray-100 bg-amber-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Membership Inactive</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Your roadmap progress is paused. Reactivate your subscription to continue from your current stage and regain full AI agent access.
            </p>
          </div>
        )}
      </div>

      {/* Payment Arrangement Summary (client-facing) */}
      {arrangement && (
        <div className="card mb-6 border border-purple-200 bg-purple-50/40">
          <h2 className="section-title mb-3 flex items-center gap-2 text-purple-800">
            <Calendar size={16} className="text-purple-600" />
            Payment Plan Summary
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {arrangement.setup_fee_total > 0 && (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Setup Fee</p>
                  <p className="font-semibold text-gray-900">${Number(arrangement.setup_fee_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Payment Received</p>
                  <p className="font-semibold text-green-700">${Number(arrangement.setup_fee_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                {arrangement.setup_fee_remaining > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Remaining Setup Balance</p>
                    <p className="font-semibold text-orange-600">${Number(arrangement.setup_fee_remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
              </>
            )}
            {arrangement.next_amount_due && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Next Payment Due</p>
                <p className="font-bold text-purple-800 text-lg">${Number(arrangement.next_amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                {arrangement.next_due_date && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(arrangement.next_due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}
          </div>
          {totalPaid > 0 && (
            <p className="text-xs text-gray-400 mt-3">Total payments logged: <span className="font-semibold text-gray-600">${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>
          )}
        </div>
      )}

      {/* Change Plan Panel */}
      {showChangePlan && canChangePlan && (
        <div className="card mb-6 border-2 border-blue-200 bg-blue-50/40">
          <h2 className="section-title mb-1 flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-blue-500" />
            Switch Plan
          </h2>
          <p className="text-xs text-gray-500 mb-4">Your billing will be prorated — you only pay the difference. No new setup fee.</p>
          <div className="space-y-3">
            {otherPrograms.map((p) => (
              <div key={p} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{PLAN_NAMES[p]}</p>
                  <p className="text-green-600 font-bold text-sm">{PLAN_PRICES[p]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(PLAN_FEATURES[p] || []).slice(0, 2).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => handleChangePlan(p)}
                  disabled={changingPlan !== null}
                  className="btn-primary text-xs px-4 py-2 shrink-0 ml-3"
                >
                  {changingPlan === p ? <Loader2 size={13} className="animate-spin" /> : 'Switch'}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowChangePlan(false)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Plan Details */}
      {program && (
        <div className="card mb-6">
          <h2 className="section-title mb-4">Your Plan — {getProgramShortLabel(program)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscribe / Reactivate CTA */}
      {!isActive && program && !showProgramSwitch && (
        <div className="card bg-gradient-to-br from-green-600 to-green-800 border-0 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Shield size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-lg mb-1">
                {profile?.subscription_status === 'canceled' ? 'Reactivate Your Membership' : 'Start Your Program'}
              </h3>
              <p className="text-green-200 text-sm mb-5 leading-relaxed">
                {profile?.subscription_status === 'canceled'
                  ? `Your progress is saved. Reactivate to continue from Stage: ${profile?.current_stage || 'where you left off'}.`
                  : `Subscribe to unlock full AI fulfillment, task tracking, document management, and reports for ${getProgramShortLabel(program)}.`
                }
              </p>
              {price && <p className="text-white font-bold text-xl mb-4">{price}</p>}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSubscribe}
                  className="bg-white text-green-700 font-bold px-8 py-3.5 rounded-xl hover:bg-green-50 transition-colors inline-flex items-center gap-2"
                >
                  <CreditCard size={16} />
                  Subscribe Now
                </button>
                <button
                  onClick={() => setShowProgramSwitch(true)}
                  className="text-green-200 hover:text-white text-sm underline underline-offset-2 transition-colors"
                >
                  Switch program
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Program switcher for inactive users */}
      {!isActive && program && showProgramSwitch && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Choose Your Program</h2>
              <p className="text-sm text-gray-500 mt-1">Select a plan and proceed to payment</p>
            </div>
            <button onClick={() => setShowProgramSwitch(false)} className="text-sm text-gray-400 hover:text-gray-600 underline">Cancel</button>
          </div>

          {Object.entries({ program_a: { icon: <Zap size={18} className="text-blue-600" />, bg: 'bg-blue-100', label: 'Program A — 0% APR Card Strategy', desc: 'Build high-limit 0% intro APR credit card stack for business or personal capital', badge: '$1,500 setup', badgeColor: 'bg-blue-100 text-blue-700', monthly: 'then $399/month' }, program_b: { icon: <Building2 size={18} className="text-green-600" />, bg: 'bg-green-100', label: 'Program B — Business Credit Builder', desc: 'Build a strong business credit profile with D-U-N-S, vendor tradelines, and bureau monitoring', badge: '$997 setup', badgeColor: 'bg-green-100 text-green-700', monthly: 'then $199/month' }, program_c: { icon: <BarChart3 size={18} className="text-purple-600" />, bg: 'bg-purple-100', label: 'Program C — Capital Monitoring', desc: 'Monthly credit snapshot, banking analysis, obligation risk scan, and 30-day action plan', badge: 'No setup fee', badgeColor: 'bg-purple-100 text-purple-700', monthly: '$97/month' } }).map(([key, p]) => (
            <div key={key} className={`card border-2 transition-colors ${program === key ? 'border-green-400 bg-green-50/40' : 'border-gray-200 hover:border-green-400'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 ${p.bg} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>{p.icon}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{p.label}</span>
                      {program === key && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 uppercase">Current</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{p.desc}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.badgeColor}`}>{p.badge}</span>
                      <span className="text-xs text-gray-500">{p.monthly}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setShowProgramSwitch(false); handleSelectAndEnroll(key) }}
                  disabled={selectingPlan !== null}
                  className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
                >
                  {selectingPlan === key ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  {program === key ? 'Continue' : 'Select'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No program assigned — show plan selector so they can subscribe directly */}
      {!isActive && !program && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-gray-900">Choose Your Program</h2>
            <p className="text-sm text-gray-500 mt-1">Select a plan and proceed directly to payment — no analyzer required</p>
          </div>

          {/* Program A */}
          <div className="card border-2 border-gray-200 hover:border-green-400 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Zap size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Program A — 0% APR Card Strategy</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Build high-limit 0% intro APR credit card stack for business or personal capital</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">$1,500 setup</span>
                    <span className="text-xs text-gray-500">then $399/month</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleSelectAndEnroll('program_a')}
                disabled={selectingPlan !== null}
                className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
              >
                {selectingPlan === 'program_a' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Get Started
              </button>
            </div>
          </div>

          {/* Program B */}
          <div className="card border-2 border-gray-200 hover:border-green-400 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Program B — Business Credit Builder</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Build a strong business credit profile with D-U-N-S, vendor tradelines, and bureau monitoring</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">$997 setup</span>
                    <span className="text-xs text-gray-500">then $199/month</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleSelectAndEnroll('program_b')}
                disabled={selectingPlan !== null}
                className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
              >
                {selectingPlan === 'program_b' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Get Started
              </button>
            </div>
          </div>

          {/* Program C */}
          <div className="card border-2 border-gray-200 hover:border-green-400 transition-colors">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <BarChart3 size={18} className="text-purple-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Program C — Capital Monitoring</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Monthly credit snapshot, banking analysis, obligation risk scan, and 30-day action plan</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">No setup fee</span>
                    <span className="text-xs text-gray-500">$97/month</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleSelectAndEnroll('program_c')}
                disabled={selectingPlan !== null}
                className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
              >
                {selectingPlan === 'program_c' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Get Started
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pt-2">
            Not sure which program fits? <a href="/analyzer" className="text-green-600 underline font-medium">Take the free analyzer</a> — takes 2 minutes.
          </p>
        </div>
      )}

      {/* Legal Disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed px-2">
        Subscriptions are billed monthly. Cancel anytime. Cancellation pauses progress and limits portal access — data is never deleted. SourcifyLending does not guarantee specific credit approvals, credit limits, or funding outcomes.
      </p>
    </PortalLayout>
  )
}
