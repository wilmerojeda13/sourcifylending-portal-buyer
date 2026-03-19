'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, CheckCircle, XCircle, AlertTriangle, Clock, Zap,
  CreditCard, Link, Plus, Save, Loader2, Trash2, RefreshCw,
  ChevronDown, ChevronUp, ExternalLink, FileText, Calendar, Layers,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { PROGRAM_INFO } from '@/lib/stripe'
import type { ProgramId } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface BillingData {
  profile: {
    id: string
    full_name: string
    email: string
    assigned_program: ProgramId | null
    subscription_status: string
    account_state: string
  }
  subscription: {
    id: string
    status: string
    access_status: string | null
    billing_status: string | null
    billing_source: string | null
    activation_source: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    setup_fee_standard: number | null
    setup_fee_paid: number | null
    monthly_fee_standard: number | null
    admin_billing_notes: string | null
  } | null
  arrangement: {
    id: string
    setup_fee_total: number
    setup_fee_paid: number
    setup_fee_remaining: number
    recurring_amount: number
    next_amount_due: number | null
    next_due_date: string | null
    notes: string | null
    created_by: string | null
    created_at: string
  } | null
  payment_records: Array<{
    id: string
    amount: number
    payment_date: string
    payment_source: string
    payment_type: string | null
    notes: string | null
    stripe_invoice_id: string | null
    logged_by: string | null
    created_at: string
  }>
  program_info: { name: string; setupFee: number | null; monthlyFee: number; hasSetup: boolean } | null
  total_paid: number
}

interface Props {
  userId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const ACCESS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-700',
}

const BILLING_BADGE: Record<string, string> = {
  paid_in_full: 'bg-green-100 text-green-800',
  recurring_active: 'bg-blue-100 text-blue-800',
  partial_setup_paid: 'bg-yellow-100 text-yellow-800',
  setup_balance_due: 'bg-orange-100 text-orange-800',
  payment_arrangement: 'bg-purple-100 text-purple-800',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  unpaid: 'bg-gray-100 text-gray-500',
}

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% APR',
  program_b: 'Program B — Biz Credit',
  program_c: 'Program C — Monitoring',
}

const PROGRAM_COLORS: Record<string, string> = {
  program_a: 'bg-blue-100 text-blue-800 border-blue-200',
  program_b: 'bg-purple-100 text-purple-800 border-purple-200',
  program_c: 'bg-green-100 text-green-800 border-green-200',
}

const ACTIVATION_LABEL: Record<string, string> = {
  stripe_activated: 'Stripe Activated',
  admin_activated: 'Admin Activated',
  manual_override: 'Manual Override',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BillingControlPanel({ userId }: Props) {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [showArrangementForm, setShowArrangementForm] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showStripePanel, setShowStripePanel] = useState(false)
  const [savingArrangement, setSavingArrangement] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)

  // Membership management
  const [memberships, setMemberships] = useState<Array<{ id: string; program_code: string; status: string; activated_at: string | null }>>([])
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [addingProgram, setAddingProgram] = useState<string | null>(null)
  const [removingProgram, setRemovingProgram] = useState<string | null>(null)

  // Arrangement form
  const [arrForm, setArrForm] = useState({
    setup_fee_total: '',
    setup_fee_paid: '',
    recurring_amount: '',
    next_amount_due: '',
    next_due_date: '',
    notes: '',
  })

  // Payment record form
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_source: 'manual_transfer',
    payment_type: 'partial_setup',
    notes: '',
    stripe_invoice_id: '',
  })

  // Stripe action form
  const [stripeForm, setStripeForm] = useState({
    action: 'create_customer',
    stripe_customer_id: '',
    stripe_subscription_id: '',
    amount_cents: '',
    description: '',
    due_days: '7',
    price_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billing/${userId}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)

      // Pre-fill arrangement form if exists
      if (json.arrangement) {
        const a = json.arrangement
        setArrForm({
          setup_fee_total: String(a.setup_fee_total ?? ''),
          setup_fee_paid: String(a.setup_fee_paid ?? ''),
          recurring_amount: String(a.recurring_amount ?? ''),
          next_amount_due: String(a.next_amount_due ?? ''),
          next_due_date: a.next_due_date ?? '',
          notes: a.notes ?? '',
        })
      } else if (json.program_info) {
        setArrForm(f => ({
          ...f,
          setup_fee_total: String(json.program_info.setupFee ?? ''),
          recurring_amount: String(json.program_info.monthlyFee ?? ''),
        }))
      }
    } catch {
      toast.error('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadMemberships = useCallback(async () => {
    setMembershipLoading(true)
    try {
      const res = await fetch(`/api/admin/memberships?user_id=${userId}`)
      const json = await res.json()
      setMemberships(json.memberships ?? [])
    } catch {
      // silently fail — memberships are a bonus
    } finally {
      setMembershipLoading(false)
    }
  }, [userId])

  useEffect(() => { load(); loadMemberships() }, [load, loadMemberships])

  const handleAddMembership = async (programCode: string) => {
    setAddingProgram(programCode)
    try {
      const res = await fetch('/api/admin/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, program_code: programCode }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      toast.success(`${PROGRAM_LABELS[programCode]} added`)
      await Promise.all([loadMemberships(), load()])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add membership')
    } finally {
      setAddingProgram(null)
    }
  }

  const handleRemoveMembership = async (programCode: string) => {
    if (!confirm(`Remove ${PROGRAM_LABELS[programCode]} from this account?`)) return
    setRemovingProgram(programCode)
    try {
      const res = await fetch('/api/admin/memberships', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, program_code: programCode }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      toast.success(`${PROGRAM_LABELS[programCode]} removed`)
      await Promise.all([loadMemberships(), load()])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove membership')
    } finally {
      setRemovingProgram(null)
    }
  }

  const handleActivate = async (deactivate = false) => {
    setActivating(true)
    try {
      const res = await fetch('/api/admin/billing/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          deactivate,
          activation_source: 'admin_activated',
          billing_status: deactivate ? 'canceled' : 'partial_setup_paid',
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(deactivate ? 'Account deactivated' : 'Account manually activated')
      await load()
    } catch {
      toast.error('Failed to update access')
    } finally {
      setActivating(false)
    }
  }

  const handleSaveArrangement = async () => {
    if (!data?.profile.assigned_program) {
      toast.error('User has no assigned program')
      return
    }
    setSavingArrangement(true)
    try {
      const res = await fetch('/api/admin/billing/arrangement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          program_code: data.profile.assigned_program,
          ...arrForm,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Payment arrangement saved')
      setShowArrangementForm(false)
      await load()
    } catch {
      toast.error('Failed to save arrangement')
    } finally {
      setSavingArrangement(false)
    }
  }

  const handleLogPayment = async () => {
    setSavingPayment(true)
    try {
      const res = await fetch('/api/admin/billing/payment-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...payForm }),
      })
      if (!res.ok) throw new Error()
      toast.success('Payment logged')
      setShowPaymentForm(false)
      setPayForm(f => ({ ...f, amount: '', notes: '', stripe_invoice_id: '' }))
      await load()
    } catch {
      toast.error('Failed to log payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Delete this payment record?')) return
    try {
      const res = await fetch('/api/admin/billing/payment-record', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      toast.success('Record deleted')
      await load()
    } catch {
      toast.error('Failed to delete record')
    }
  }

  const handleStripeAction = async () => {
    setStripeLoading(true)
    try {
      const body: Record<string, unknown> = { user_id: userId, action: stripeForm.action }

      if (stripeForm.action === 'attach_customer') body.stripe_customer_id = stripeForm.stripe_customer_id
      else if (stripeForm.action === 'attach_subscription') body.stripe_subscription_id = stripeForm.stripe_subscription_id
      else if (stripeForm.action === 'send_invoice' || stripeForm.action === 'create_payment_link') {
        body.amount_cents = Math.round(Number(stripeForm.amount_cents) * 100)
        body.description = stripeForm.description
        body.due_days = Number(stripeForm.due_days)
      } else if (stripeForm.action === 'start_recurring') {
        body.price_id = stripeForm.price_id
      }

      const res = await fetch('/api/admin/billing/stripe-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      if (json.invoice_url) {
        toast.success('Invoice sent!')
        window.open(json.invoice_url, '_blank')
      } else if (json.payment_link_url) {
        toast.success('Payment link created!')
        navigator.clipboard.writeText(json.payment_link_url)
        window.open(json.payment_link_url, '_blank')
      } else {
        toast.success('Stripe action completed')
      }
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Stripe action failed')
    } finally {
      setStripeLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) return <div className="text-sm text-gray-500 py-8">Failed to load billing data.</div>

  const { profile, subscription, arrangement, payment_records, program_info, total_paid } = data
  const isActive = subscription?.access_status === 'active' || profile.subscription_status === 'active'
  const program = profile.assigned_program
  const setupStandard = program_info?.setupFee ?? subscription?.setup_fee_standard ?? 0
  const setupPaid = subscription?.setup_fee_paid ?? 0
  const setupRemaining = setupStandard ? Math.max(0, setupStandard - setupPaid) : 0

  return (
    <div className="space-y-6">

      {/* ── Overview Card ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">Billing Overview</span>
          </div>
          <button onClick={load} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Active Programs */}
          <div className="col-span-2 md:col-span-3">
            <p className="text-xs text-gray-500 mb-1.5">Active Programs</p>
            {memberships.filter(m => m.status === 'active').length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {memberships.filter(m => m.status === 'active').map(m => (
                  <span key={m.program_code} className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${PROGRAM_COLORS[m.program_code] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {PROGRAM_LABELS[m.program_code] ?? m.program_code}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-400">
                {program_info?.name ?? (program ? PROGRAM_LABELS[program] ?? program : 'No programs enrolled')}
              </p>
            )}
          </div>

          {/* Access Status */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Portal Access</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ACCESS_BADGE[subscription?.access_status ?? (isActive ? 'active' : 'inactive')] ?? 'bg-gray-100 text-gray-500'}`}>
              {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {subscription?.access_status ?? (isActive ? 'active' : 'inactive')}
            </span>
          </div>

          {/* Billing Status */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Billing Status</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${BILLING_BADGE[subscription?.billing_status ?? 'unpaid'] ?? 'bg-gray-100 text-gray-500'}`}>
              {subscription?.billing_status ?? 'unpaid'}
            </span>
          </div>

          {/* Activation Source */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Activated By</p>
            <p className="text-sm text-gray-700">
              {subscription?.activation_source
                ? ACTIVATION_LABEL[subscription.activation_source] ?? subscription.activation_source
                : '—'}
            </p>
          </div>

          {/* Standard Setup Fee */}
          {setupStandard > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Setup Fee</p>
              <p className="text-sm text-gray-700">
                {fmt(setupStandard)}
                {setupPaid > 0 && <span className="text-green-600 ml-1">({fmt(setupPaid)} paid)</span>}
              </p>
            </div>
          )}

          {/* Monthly Fee */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Monthly Fee</p>
            <p className="text-sm text-gray-700">{fmt(program_info?.monthlyFee ?? subscription?.monthly_fee_standard)}/mo</p>
          </div>

          {/* Total Paid */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Total Paid (logged)</p>
            <p className="text-sm font-semibold text-green-700">{fmt(total_paid)}</p>
          </div>

          {/* Remaining Setup Balance */}
          {setupStandard > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Setup Balance Due</p>
              <p className={`text-sm font-semibold ${setupRemaining > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                {setupRemaining > 0 ? fmt(setupRemaining) : 'Paid in full'}
              </p>
            </div>
          )}

          {/* Stripe Links */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Stripe Customer</p>
            <p className="text-xs text-gray-700 font-mono truncate">
              {subscription?.stripe_customer_id ?? <span className="text-gray-400">Not linked</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Stripe Subscription</p>
            <p className="text-xs text-gray-700 font-mono truncate">
              {subscription?.stripe_subscription_id ?? <span className="text-gray-400">Not linked</span>}
            </p>
          </div>
        </div>

        {/* Arrangement next payment */}
        {arrangement && arrangement.next_amount_due && (
          <div className="mx-5 mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-purple-800">Next Payment Due</span>
            </div>
            <p className="text-lg font-bold text-purple-900">{fmt(arrangement.next_amount_due)}</p>
            {arrangement.next_due_date && (
              <p className="text-xs text-purple-700">Due: {new Date(arrangement.next_due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            )}
          </div>
        )}

        {/* Admin billing notes */}
        {subscription?.admin_billing_notes && (
          <div className="mx-5 mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs font-semibold text-yellow-800 mb-1">Internal Notes</p>
            <p className="text-xs text-yellow-900 whitespace-pre-wrap">{subscription.admin_billing_notes}</p>
          </div>
        )}
      </div>

      {/* ── Membership Management ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">Membership Management</span>
          </div>
          <button onClick={loadMemberships} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className={`w-4 h-4 ${membershipLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Add or remove program enrollments. A client can be enrolled in multiple programs simultaneously (e.g. A + B, or any program + C).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['program_a', 'program_b', 'program_c'] as const).map((code) => {
              const active = memberships.find(m => m.program_code === code && m.status === 'active')
              const isAdding = addingProgram === code
              const isRemoving = removingProgram === code
              return (
                <div key={code} className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${active ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${PROGRAM_COLORS[code]}`}>
                        {code === 'program_a' ? 'Program A' : code === 'program_b' ? 'Program B' : 'Program C'}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {code === 'program_a' ? '0% Intro APR Strategy' : code === 'program_b' ? 'Business Credit Builder' : 'Capital Monitoring'}
                      </p>
                    </div>
                    {active
                      ? <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0"><CheckCircle className="w-3 h-3" /> Active</span>
                      : <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">Inactive</span>
                    }
                  </div>
                  {active ? (
                    <button onClick={() => handleRemoveMembership(code)} disabled={isRemoving}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove
                    </button>
                  ) : (
                    <button onClick={() => handleAddMembership(code)} disabled={isAdding}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 bg-white hover:bg-green-50 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Enroll
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {memberships.filter(m => m.status === 'active').length > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600">
              <span className="font-semibold">Active enrollments:</span>{' '}
              {memberships.filter(m => m.status === 'active').map(m => PROGRAM_LABELS[m.program_code] ?? m.program_code).join(' + ')}
            </div>
          )}
        </div>
      </div>

      {/* ── Access Control ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">Manual Access Control</span>
          </div>
        </div>
        <div className="p-5 flex flex-col sm:flex-row gap-3">
          {!isActive ? (
            <button
              onClick={() => handleActivate(false)}
              disabled={activating}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Manually Activate Account
            </button>
          ) : (
            <button
              onClick={() => handleActivate(true)}
              disabled={activating}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Deactivate Account
            </button>
          )}
          <p className="self-center text-xs text-gray-500">
            Manual activation grants portal access regardless of Stripe payment status.
            Label: <strong>{isActive ? (ACTIVATION_LABEL[subscription?.activation_source ?? ''] ?? 'Active') : 'Inactive'}</strong>
          </p>
        </div>
      </div>

      {/* ── Payment Arrangement ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowArrangementForm(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">
              Payment Arrangement
              {arrangement && <span className="ml-2 text-xs text-purple-700 font-normal">(active)</span>}
            </span>
          </div>
          {showArrangementForm ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showArrangementForm && (
          <div className="p-5 space-y-4">
            {arrangement && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 space-y-1">
                <p><strong>Current arrangement</strong> — created by {arrangement.created_by ?? 'admin'} on {new Date(arrangement.created_at).toLocaleDateString()}</p>
                <p>Setup: {fmt(arrangement.setup_fee_total)} total · {fmt(arrangement.setup_fee_paid)} paid · {fmt(arrangement.setup_fee_remaining)} remaining</p>
                {arrangement.notes && <p className="italic">{arrangement.notes}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Setup Fee Total ($)</label>
                <input type="number" value={arrForm.setup_fee_total} onChange={e => setArrForm(f => ({ ...f, setup_fee_total: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="997" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Setup Fee Paid So Far ($)</label>
                <input type="number" value={arrForm.setup_fee_paid} onChange={e => setArrForm(f => ({ ...f, setup_fee_paid: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="499" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Monthly Recurring ($)</label>
                <input type="number" value={arrForm.recurring_amount} onChange={e => setArrForm(f => ({ ...f, recurring_amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="199" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Next Amount Due ($)</label>
                <input type="number" value={arrForm.next_amount_due} onChange={e => setArrForm(f => ({ ...f, next_amount_due: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="697" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Next Due Date</label>
                <input type="date" value={arrForm.next_due_date} onChange={e => setArrForm(f => ({ ...f, next_due_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>

            {/* Calculated preview */}
            {arrForm.setup_fee_total && arrForm.setup_fee_paid && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 space-y-1">
                <p>Setup remaining: <strong>{fmt(Number(arrForm.setup_fee_total) - Number(arrForm.setup_fee_paid))}</strong></p>
                {arrForm.next_amount_due && <p>Next payment: <strong>{fmt(Number(arrForm.next_amount_due))}</strong></p>}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-600 mb-1">Internal Notes (admin only)</label>
              <textarea value={arrForm.notes} onChange={e => setArrForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. Closed on partial deposit. 499 collected. Remaining setup added to next cycle with first month." />
            </div>

            <button
              onClick={handleSaveArrangement}
              disabled={savingArrangement}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {savingArrangement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Arrangement
            </button>
          </div>
        )}
      </div>

      {/* ── Payment Records ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">Payment Records</span>
            <span className="text-xs text-gray-500">({payment_records.length})</span>
          </div>
          <button
            onClick={() => setShowPaymentForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="w-3 h-3" /> Log Payment
          </button>
        </div>

        {showPaymentForm && (
          <div className="p-5 border-b border-gray-100 bg-green-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Amount ($)</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="499" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Date</label>
                <input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Source</label>
                <select value={payForm.payment_source} onChange={e => setPayForm(f => ({ ...f, payment_source: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="manual_transfer">Bank Transfer</option>
                  <option value="manual_cash">Cash</option>
                  <option value="manual_check">Check</option>
                  <option value="stripe_checkout">Stripe Checkout</option>
                  <option value="stripe_invoice">Stripe Invoice</option>
                  <option value="admin_adjustment">Admin Adjustment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Type</label>
                <select value={payForm.payment_type} onChange={e => setPayForm(f => ({ ...f, payment_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="partial_setup">Partial Setup</option>
                  <option value="setup_fee">Full Setup Fee</option>
                  <option value="balance_payment">Balance Payment</option>
                  <option value="monthly">Monthly</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Notes</label>
                <input type="text" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="e.g. Deposit collected at close" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Stripe Invoice ID (optional)</label>
                <input type="text" value={payForm.stripe_invoice_id} onChange={e => setPayForm(f => ({ ...f, stripe_invoice_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="in_xxx" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleLogPayment} disabled={savingPayment}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Payment
              </button>
              <button onClick={() => setShowPaymentForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {payment_records.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No payments logged yet</p>
          ) : (
            payment_records.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-green-700">{fmt(r.amount)}</span>
                    <span className="text-xs text-gray-500">{r.payment_source.replace(/_/g, ' ')}</span>
                    {r.payment_type && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r.payment_type.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(r.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {r.notes && <span className="ml-2 italic">{r.notes}</span>}
                    {r.logged_by && <span className="ml-2 text-gray-400">by {r.logged_by}</span>}
                  </div>
                </div>
                <button onClick={() => handleDeleteRecord(r.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Stripe Actions ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowStripePanel(v => !v)}
          className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-800">Stripe Actions</span>
          </div>
          {showStripePanel ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showStripePanel && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Action</label>
              <select value={stripeForm.action} onChange={e => setStripeForm(f => ({ ...f, action: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="create_customer">Create Stripe Customer</option>
                <option value="attach_customer">Attach Existing Customer ID</option>
                <option value="attach_subscription">Attach Existing Subscription ID</option>
                <option value="send_invoice">Send Stripe Invoice</option>
                <option value="create_payment_link">Create Payment Link</option>
                <option value="start_recurring">Start Recurring Billing</option>
              </select>
            </div>

            {stripeForm.action === 'attach_customer' && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Stripe Customer ID</label>
                <input type="text" value={stripeForm.stripe_customer_id} onChange={e => setStripeForm(f => ({ ...f, stripe_customer_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="cus_xxx" />
              </div>
            )}

            {stripeForm.action === 'attach_subscription' && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Stripe Subscription ID</label>
                <input type="text" value={stripeForm.stripe_subscription_id} onChange={e => setStripeForm(f => ({ ...f, stripe_subscription_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="sub_xxx" />
              </div>
            )}

            {(stripeForm.action === 'send_invoice' || stripeForm.action === 'create_payment_link') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Amount ($)</label>
                  <input type="number" value={stripeForm.amount_cents} onChange={e => setStripeForm(f => ({ ...f, amount_cents: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="697" />
                </div>
                {stripeForm.action === 'send_invoice' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Due in (days)</label>
                    <input type="number" value={stripeForm.due_days} onChange={e => setStripeForm(f => ({ ...f, due_days: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="7" />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Description</label>
                  <input type="text" value={stripeForm.description} onChange={e => setStripeForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="e.g. Program B — Setup balance ($498) + Month 1 ($199)" />
                </div>
              </div>
            )}

            {stripeForm.action === 'start_recurring' && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Stripe Price ID</label>
                <input type="text" value={stripeForm.price_id} onChange={e => setStripeForm(f => ({ ...f, price_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="price_xxx" />
              </div>
            )}

            {stripeForm.action === 'create_customer' && (
              <p className="text-xs text-gray-500">Creates a Stripe customer for <strong>{profile.email}</strong> and links it to this account.</p>
            )}

            <button
              onClick={handleStripeAction}
              disabled={stripeLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              Run Action
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
