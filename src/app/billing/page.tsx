'use client'
import { useState, useEffect } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { formatPricingLabel, getProgramPricing, normalizeAcquisitionPath } from '@/lib/partner-program'
import { useBusinessContext } from '@/lib/use-business-context'
import {
  CreditCard, CheckCircle, Shield, Loader2, Zap, Building2,
  BarChart3, Calendar, Plus, ExternalLink, Lock,
} from 'lucide-react'
import type { UserProfile } from '@/types'
import toast from 'react-hot-toast'

interface Membership {
  id: string
  program_code: string
  status: string
  started_at: string
}

interface PaymentArrangement {
  setup_fee_total: number
  setup_fee_paid: number
  setup_fee_remaining: number
  recurring_amount: number
  next_amount_due: number | null
  next_due_date: string | null
}

const PROGRAM_NAMES: Record<string, string> = {
  program_a: 'Program A — 0% APR Card Strategy',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring',
}

const PROGRAM_FEATURES: Record<string, string[]> = {
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
    "Do/Don't monthly rules",
  ],
}

const PROGRAM_ICONS: Record<string, React.ReactNode> = {
  program_a: <Zap size={18} className="text-blue-600" />,
  program_b: <Building2 size={18} className="text-green-600" />,
  program_c: <BarChart3 size={18} className="text-purple-600" />,
}

const PROGRAM_ICON_BG: Record<string, string> = {
  program_a: 'bg-blue-100 dark:bg-blue-900/40',
  program_b: 'bg-green-100 dark:bg-green-900/40',
  program_c: 'bg-purple-100 dark:bg-purple-900/40',
}

function getAvailableAddOns(activeMemberships: Membership[]): string[] {
  const active = activeMemberships.map((m) => m.program_code)
  if (active.length === 0) return []
  if ((active.includes('program_a') || active.includes('program_b')) && !active.includes('program_c')) {
    return ['program_c']
  }
  return []
}

export default function BillingPage() {
  const supabase = createClient()
  const { activeBusinessId } = useBusinessContext()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [arrangement, setArrangement] = useState<PaymentArrangement | null>(null)
  const [totalPaid, setTotalPaid] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [selectingPlan, setSelectingPlan] = useState<string | null>(null)
  const [subscriptionRequiredFlow, setSubscriptionRequiredFlow] = useState(false)
  const [newBusinessFlow, setNewBusinessFlow] = useState(false)

  useEffect(() => {
    const init = async () => {
      if (!activeBusinessId) return
      const [{ data: p }, { data: sub }, { data: mem }, { data: arr }, { data: records }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', activeBusinessId).single(),
        supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', activeBusinessId).maybeSingle(),
        supabase.from('memberships').select('*').eq('user_id', activeBusinessId).eq('status', 'active'),
        supabase.from('payment_arrangements').select('*').eq('user_id', activeBusinessId).eq('is_active', true).maybeSingle(),
        supabase.from('payment_records').select('amount').eq('user_id', activeBusinessId),
      ])
      setProfile(p)
      setStripeCustomerId(sub?.stripe_customer_id ?? null)
      setMemberships(mem ?? [])
      setArrangement(arr ?? null)
      setTotalPaid((records ?? []).reduce((sum, r) => sum + Number(r.amount), 0))
      setLoading(false)
    }
    init()
  }, [activeBusinessId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check for add-on success/cancel from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSubscriptionRequiredFlow(params.get('subscription_required') === '1')
    setNewBusinessFlow(params.get('new_business') === '1')
    if (params.get('add_on') === 'success') {
      toast.success('Add-on membership activated!')
      window.history.replaceState({}, '', '/billing')
    } else if (params.get('add_on') === 'canceled') {
      toast.error('Add-on checkout was canceled.')
      window.history.replaceState({}, '', '/billing')
    }
  }, [])

  const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
  const acquisitionPath = normalizeAcquisitionPath(profile?.acquisition_path)
  const canManageBilling = isActive && !!stripeCustomerId
  const availableAddOns = getAvailableAddOns(memberships)

  const allPrograms = memberships.map((m) => m.program_code).filter(Boolean)
  const activePrograms = allPrograms.length > 0 ? allPrograms : (profile?.assigned_program ? [profile.assigned_program] : [])

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

  const handleAddOn = async (program: string) => {
    setAddingOn(program)
    try {
      const res = await fetch('/api/stripe/add-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to start checkout')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setAddingOn(null)
  }

  const handleSelectAndEnroll = async (selectedProgram: string) => {
    setSelectingPlan(selectedProgram)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ assigned_program: selectedProgram, updated_at: new Date().toISOString() })
        .eq('id', activeBusinessId)
      if (error) { toast.error('Failed to select program. Please try again.'); return }
      window.location.href = '/enroll'
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSelectingPlan(null)
    }
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </PortalLayout>
    )
  }

  // Delegates cannot access billing
  if ((profile as unknown as { is_delegate?: boolean } | null)?.is_delegate) {
    return (
      <PortalLayout
        userName={profile?.full_name || ''}
        programLabel={getProgramShortLabel(profile?.assigned_program ?? null)}
        assignedProgram={profile?.assigned_program}
        portalBlocked={profile?.portal_blocked}
        isDemo={profile?.is_demo}
        isAdmin={profile?.is_admin}
        isDelegate={true}
        allPrograms={activePrograms}
      >
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
            <Lock size={22} className="text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Billing Not Available</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
            Billing and subscription management are only accessible to the primary account owner. Please contact the account owner for any billing questions.
          </p>
        </div>
      </PortalLayout>
    )
  }

  const program = profile?.assigned_program || null
  const pathLabel = acquisitionPath === 'partner_assisted' ? 'Partner-Assisted' : 'Self-Serve'
  const pricingText = (programCode: string) => {
    if (programCode !== 'program_a' && programCode !== 'program_b' && programCode !== 'program_c') return ''
    return formatPricingLabel(programCode, acquisitionPath)
  }
  const pricingBadge = (programCode: string) => {
    if (programCode !== 'program_a' && programCode !== 'program_b' && programCode !== 'program_c') return ''
    const pricing = getProgramPricing(programCode, acquisitionPath)
    return pricing.setupFeeCents > 0 ? `Includes $${pricing.setupFeeCents / 100} onboarding setup` : 'No setup fee'
  }

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program ?? null)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <CreditCard size={24} className="text-green-500" />
          Billing & Membership
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your SourcifyLending memberships</p>
      </div>

      {(subscriptionRequiredFlow || (!isActive && newBusinessFlow)) && (
        <div className="card mb-6 border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/40">
              <Lock size={18} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {newBusinessFlow ? 'New business created' : 'Subscription required'}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                This business needs its own subscription before portal tools unlock. One paid subscription only applies to one business under the current plan structure.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Memberships ─────────────────────────────────────────────── */}
      {memberships.length > 0 && (
        <div className="mb-6">
          <h2 className="section-title mb-3">Active Memberships</h2>
          <div className="space-y-3">
            {memberships.map((m) => (
              <div key={m.id} className="card border border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${PROGRAM_ICON_BG[m.program_code] ?? 'bg-gray-100 dark:bg-gray-700'} rounded-xl flex items-center justify-center shrink-0`}>
                      {PROGRAM_ICONS[m.program_code]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{PROGRAM_NAMES[m.program_code] ?? m.program_code}</p>
                      <p className="text-green-600 font-bold text-sm">{pricingText(m.program_code)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{pathLabel} pricing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status="active" />
                    {canManageBilling && (
                      <button
                        onClick={handlePortal}
                        disabled={portalLoading}
                        className="btn-secondary text-xs flex items-center gap-1"
                      >
                        {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                        Manage
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-100 dark:border-green-900/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(PROGRAM_FEATURES[m.program_code] ?? []).map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <CheckCircle size={13} className="text-green-500 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fallback: legacy single-program active (no memberships rows yet) ── */}
      {memberships.length === 0 && isActive && program && (
        <div className="card mb-6 border border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${PROGRAM_ICON_BG[program] ?? 'bg-gray-100 dark:bg-gray-700'} rounded-xl flex items-center justify-center shrink-0`}>
                {PROGRAM_ICONS[program]}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{PROGRAM_NAMES[program]}</p>
                <p className="text-green-600 font-bold text-sm">{pricingText(program)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{pathLabel} pricing</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={profile?.subscription_status || 'active'} />
              {canManageBilling && (
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  Manage
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Arrangement Summary ────────────────────────────────────── */}
      {arrangement && (
        <div className="card mb-6 border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-900/20">
          <h2 className="section-title mb-3 flex items-center gap-2 text-purple-800 dark:text-purple-300">
            <Calendar size={16} className="text-purple-600" />
            Payment Plan Summary
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {arrangement.setup_fee_total > 0 && (
              <>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Setup Fee</p>
                  <p className="font-semibold text-gray-900 dark:text-white">${Number(arrangement.setup_fee_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Payment Received</p>
                  <p className="font-semibold text-green-700">${Number(arrangement.setup_fee_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                {arrangement.setup_fee_remaining > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Remaining Balance</p>
                    <p className="font-semibold text-orange-600">${Number(arrangement.setup_fee_remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
              </>
            )}
            {arrangement.next_amount_due && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Next Payment Due</p>
                <p className="font-bold text-purple-800 dark:text-purple-300 text-lg">${Number(arrangement.next_amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                {arrangement.next_due_date && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(arrangement.next_due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}
          </div>
          {totalPaid > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Total payments logged: <span className="font-semibold text-gray-600 dark:text-gray-300">${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>
          )}
        </div>
      )}

      {/* ── Available Add-ons ──────────────────────────────────────────────── */}
      {availableAddOns.length > 0 && (
        <div className="mb-6">
          <h2 className="section-title mb-1">Available Add-ons</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Enhance your membership with additional programs.</p>
          <div className="space-y-3">
            {availableAddOns.map((addon) => (
              <div key={addon} className="card border-2 border-dashed border-purple-200 dark:border-purple-700 bg-purple-50/20 dark:bg-purple-900/10 hover:border-purple-400 dark:hover:border-purple-500 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 ${PROGRAM_ICON_BG[addon] ?? 'bg-gray-100 dark:bg-gray-700'} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
                      {PROGRAM_ICONS[addon]}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{PROGRAM_NAMES[addon]}</p>
                      <p className="text-purple-600 dark:text-purple-400 font-bold text-sm">{pricingText(addon)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {addon === 'program_c' && 'Monthly credit snapshot, banking analysis, obligation risk scan, and 30-day action plan.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddOn(addon)}
                    disabled={addingOn !== null}
                    className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
                  >
                    {addingOn === addon ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Inactive: Reactivate / Subscribe CTA ──────────────────────────── */}
      {!isActive && program && (
        <div className="card bg-gradient-to-br from-green-600 to-green-800 border-0 text-white mb-6">
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
              <p className="text-white font-bold text-xl mb-1">{pricingText(program)}</p>
              <p className="text-green-200 text-xs mb-4">{pathLabel} billing path</p>
              <button
                onClick={() => window.location.href = '/enroll'}
                className="bg-white text-green-700 font-bold px-8 py-3.5 rounded-xl hover:bg-green-50 transition-colors inline-flex items-center gap-2"
              >
                <CreditCard size={16} />
                Subscribe Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No program: full plan selector ────────────────────────────────── */}
      {!isActive && !program && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Choose Your Program</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a plan and proceed directly to payment under your {pathLabel.toLowerCase()} pricing path.</p>
          </div>

          {[
            { key: 'program_a', desc: 'Build high-limit 0% intro APR credit card stack for business or personal capital', badgeColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
            { key: 'program_b', desc: 'Build a strong business credit profile with D-U-N-S, vendor tradelines, and bureau monitoring', badgeColor: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
            { key: 'program_c', desc: 'Monthly credit snapshot, banking analysis, obligation risk scan, and 30-day action plan', badgeColor: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' },
          ].map(({ key, desc, badgeColor }) => (
            <div key={key} className="card border-2 border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600 transition-colors">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 ${PROGRAM_ICON_BG[key]} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
                    {PROGRAM_ICONS[key]}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{PROGRAM_NAMES[key]}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>{pricingBadge(key)}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{pricingText(key)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleSelectAndEnroll(key)}
                  disabled={selectingPlan !== null}
                  className="btn-primary text-sm px-5 py-2.5 shrink-0 flex items-center gap-2 self-center"
                >
                  {selectingPlan === key ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Get Started
                </button>
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
            Not sure which program fits? Contact us at <span className="font-medium text-gray-500 dark:text-gray-400">support@sourcifylending.com</span> and we&apos;ll help you choose.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6 leading-relaxed px-2">
        Subscriptions are billed monthly. Cancel anytime. Cancellation pauses progress and limits portal access — data is never deleted. SourcifyLending does not guarantee specific credit approvals, credit limits, or funding outcomes.
      </p>
    </PortalLayout>
  )
}
