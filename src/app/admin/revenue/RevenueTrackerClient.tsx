'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  Receipt,
  Repeat,
  AlertCircle,
  Users,
  Target,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Metrics {
  totalCollected: number
  thisMonth: number
  setupFeesCollected: number
  recurringCollected: number
  addOnCollected: number
  outstandingBalance: number
  mrr: number
  activePayingClients: number
}

interface ClientRow {
  userId: string
  fullName: string
  email: string
  businessName: string | null
  program: string | null
  totalPaid: number
  setupPaid: number
  recurringPaid: number
  outstandingBalance: number
  lastPaymentDate: string | null
  nextPaymentDue: string | null
  billingStatus: string | null
}

interface ProgramRow {
  program: string | null
  totalCollected: number
  clientCount: number
}

interface ActivityItem {
  id: string
  description: string
  amount: number
  date: string
  status: string
  paymentSource: string | null
}

interface RevenueGoal {
  id: string
  period_type: string
  period_start: string
  period_end: string | null
  revenue_goal: number
  created_at: string
}

interface GoalForm {
  period_type: string
  period_start: string
  period_end: string
  revenue_goal: string
}

type Tab = 'overview' | 'clients' | 'programs' | 'activity'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount)
}

function programLabel(program: string | null): string {
  if (!program) return 'No Program'
  if (program === 'program_a') return 'Program A'
  if (program === 'program_b') return 'Program B'
  if (program === 'program_c') return 'Program C'
  return program
}

function programBadgeClass(program: string | null): string {
  if (program === 'program_a') return 'bg-blue-100 text-blue-700'
  if (program === 'program_b') return 'bg-purple-100 text-purple-700'
  if (program === 'program_c') return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-500'
}

function programCardClass(program: string | null): string {
  if (program === 'program_a') return 'border-blue-200 bg-blue-50'
  if (program === 'program_b') return 'border-purple-200 bg-purple-50'
  if (program === 'program_c') return 'border-green-200 bg-green-50'
  return 'border-gray-200 bg-gray-50'
}

function programHeadingClass(program: string | null): string {
  if (program === 'program_a') return 'text-blue-700'
  if (program === 'program_b') return 'text-purple-700'
  if (program === 'program_c') return 'text-green-700'
  return 'text-gray-600'
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RevenueTrackerClient() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [byClient, setByClient] = useState<ClientRow[]>([])
  const [byProgram, setByProgram] = useState<ProgramRow[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [goals, setGoals] = useState<RevenueGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState<GoalForm>({
    period_type: 'monthly',
    period_start: new Date().toISOString().slice(0, 7) + '-01',
    period_end: '',
    revenue_goal: '',
  })

  useEffect(() => {
    fetchRevenue()
  }, [])

  async function fetchRevenue() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/revenue')
      const data = await res.json()
      if (data.metrics) {
        setMetrics(data.metrics)
        setByClient(data.byClient ?? [])
        setByProgram(data.byProgram ?? [])
        setRecentActivity(data.recentActivity ?? [])
        setGoals(data.goals ?? [])
      }
    } catch (err) {
      console.error('[RevenueTracker] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveGoal() {
    setGoalError(null)
    if (!goalForm.revenue_goal || !goalForm.period_start) {
      setGoalError('Please enter a goal amount and start date.')
      return
    }
    // Auto-compute period_end if not provided
    let periodEnd = goalForm.period_end
    if (!periodEnd && goalForm.period_start) {
      const start = new Date(goalForm.period_start)
      if (goalForm.period_type === 'monthly') {
        periodEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0).toISOString().split('T')[0]
      } else if (goalForm.period_type === 'quarterly') {
        periodEnd = new Date(start.getFullYear(), start.getMonth() + 3, 0).toISOString().split('T')[0]
      } else {
        periodEnd = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1).toISOString().split('T')[0]
      }
    }
    setSavingGoal(true)
    try {
      const res = await fetch('/api/admin/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_type: goalForm.period_type,
          period_start: goalForm.period_start,
          period_end: periodEnd,
          revenue_goal: Number(goalForm.revenue_goal),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowGoalForm(false)
        setGoalError(null)
        await fetchRevenue()
      } else {
        setGoalError(data.error || 'Failed to save goal. Please try again.')
      }
    } catch {
      setGoalError('Something went wrong. Please try again.')
    } finally {
      setSavingGoal(false)
    }
  }

  // Current monthly goal (most recent)
  const currentGoal = goals.find((g) => g.period_type === 'monthly') ?? null
  const goalProgress = currentGoal && metrics
    ? Math.min(100, Math.round((metrics.thisMonth / currentGoal.revenue_goal) * 100))
    : null

  const totalRevenue = metrics?.totalCollected ?? 0

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'clients', label: 'Clients' },
    { id: 'programs', label: 'Programs' },
    { id: 'activity', label: 'Activity' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Revenue Tracker</h1>
            <p className="text-sm text-gray-500 mt-1">Monitor collected revenue, MRR, setup fees, and outstanding balances</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRevenue}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Refresh
            </button>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
              ← Admin Hub
            </Link>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm">Loading revenue data...</div>
        )}

        {/* ── Tab: Overview ──────────────────────────────────────────────────── */}
        {!loading && activeTab === 'overview' && metrics && (
          <div className="space-y-6">

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Total Revenue */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                    <DollarSign size={18} className="text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Collected</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.totalCollected)}</p>
                <p className="text-xs text-gray-400 mt-1">All time</p>
              </div>

              {/* This Month */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                    <TrendingUp size={18} className="text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Month</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.thisMonth)}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              </div>

              {/* MRR */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                    <RefreshCw size={18} className="text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">MRR</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.mrr)}</p>
                <p className="text-xs text-gray-400 mt-1">Monthly recurring revenue</p>
              </div>

              {/* Setup Fees */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Receipt size={18} className="text-amber-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Setup Fees</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.setupFeesCollected)}</p>
                <p className="text-xs text-gray-400 mt-1">All time collected</p>
              </div>

              {/* Recurring Revenue */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                    <Repeat size={18} className="text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recurring Revenue</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.recurringCollected)}</p>
                <p className="text-xs text-gray-400 mt-1">All time collected</p>
              </div>

              {/* AI Packages */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Zap size={18} className="text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Packages</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{fmt(metrics.addOnCollected)}</p>
                <p className="text-xs text-gray-400 mt-1">Credit pack purchases</p>
              </div>

              {/* Outstanding Balance */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                    <AlertCircle size={18} className="text-red-500" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{fmt(metrics.outstandingBalance)}</p>
                <p className="text-xs text-gray-400 mt-1">Pending + arrangements</p>
              </div>

              {/* Active Paying Clients */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Users size={18} className="text-gray-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paying Clients</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{metrics.activePayingClients}</p>
                <p className="text-xs text-gray-400 mt-1">Distinct clients with payments</p>
              </div>

              {/* Goal Progress */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                    <Target size={18} className="text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Goal Progress</span>
                </div>
                {currentGoal ? (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{goalProgress}%</p>
                    <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-green-500 rounded-full transition-all"
                        style={{ width: `${goalProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {fmt(metrics.thisMonth)} of {fmt(currentGoal.revenue_goal)} goal
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">No goal set</p>
                )}
              </div>
            </div>

            {/* Revenue Goal Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Target size={18} className="text-green-600" />
                  Monthly Revenue Goal
                </h2>
                <button
                  onClick={() => setShowGoalForm(!showGoalForm)}
                  className="text-sm font-medium text-green-600 hover:text-green-700"
                >
                  {showGoalForm ? 'Cancel' : 'Set New Goal'}
                </button>
              </div>

              {currentGoal ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Target: <span className="font-semibold text-gray-900">{fmt(currentGoal.revenue_goal)}</span></span>
                    <span className="text-gray-600">Collected: <span className="font-semibold text-green-700">{fmt(metrics.thisMonth)}</span></span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-3 bg-green-500 rounded-full transition-all"
                      style={{ width: `${goalProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {fmt(Math.max(0, currentGoal.revenue_goal - metrics.thisMonth))} remaining to reach goal
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No monthly goal set. Click "Set New Goal" to add one.</p>
              )}

              {showGoalForm && (
                <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Period Type</label>
                    <select
                      value={goalForm.period_type}
                      onChange={(e) => setGoalForm({ ...goalForm, period_type: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Period Start</label>
                    <input
                      type="date"
                      value={goalForm.period_start}
                      onChange={(e) => setGoalForm({ ...goalForm, period_start: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Period End (optional)</label>
                    <input
                      type="date"
                      value={goalForm.period_end}
                      onChange={(e) => setGoalForm({ ...goalForm, period_end: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Revenue Goal ($)</label>
                    <input
                      type="number"
                      value={goalForm.revenue_goal}
                      onChange={(e) => setGoalForm({ ...goalForm, revenue_goal: e.target.value })}
                      placeholder="e.g. 10000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-4 space-y-2">
                    {goalError && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{goalError}</p>
                    )}
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveGoal}
                        disabled={savingGoal}
                        className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {savingGoal ? 'Saving...' : 'Save Goal'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Tab: Clients ───────────────────────────────────────────────────── */}
        {!loading && activeTab === 'clients' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Revenue by Client</h2>
              <p className="text-xs text-gray-400 mt-0.5">{byClient.length} clients with payment records</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Program</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Setup Fees</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Recurring</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Payment</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Due</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byClient.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-gray-400">No payment records found</td>
                    </tr>
                  )}
                  {byClient.map((client) => (
                    <tr key={client.userId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{client.fullName}</p>
                        <p className="text-xs text-gray-400">{client.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${programBadgeClass(client.program)}`}>
                          {programLabel(client.program)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(client.totalPaid)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(client.setupPaid)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(client.recurringPaid)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={client.outstandingBalance > 0 ? 'font-semibold text-red-600' : 'text-gray-400'}>
                          {client.outstandingBalance > 0 ? fmt(client.outstandingBalance) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">
                        {client.lastPaymentDate || '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">
                        {client.nextPaymentDue || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {client.billingStatus ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-gray-100 text-gray-600">
                            {client.billingStatus}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Programs ──────────────────────────────────────────────────── */}
        {!loading && activeTab === 'programs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {byProgram.map((row) => {
                const pct = totalRevenue > 0
                  ? Math.round((row.totalCollected / totalRevenue) * 100)
                  : 0
                return (
                  <div
                    key={row.program ?? 'none'}
                    className={`rounded-2xl border shadow-sm p-5 ${programCardClass(row.program)}`}
                  >
                    <h3 className={`font-bold text-base mb-1 ${programHeadingClass(row.program)}`}>
                      {programLabel(row.program)}
                    </h3>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{fmt(row.totalCollected)}</p>
                    <p className="text-xs text-gray-500 mt-1">{row.clientCount} client{row.clientCount !== 1 ? 's' : ''}</p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>% of total revenue</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${
                            row.program === 'program_a' ? 'bg-blue-500' :
                            row.program === 'program_b' ? 'bg-purple-500' :
                            row.program === 'program_c' ? 'bg-green-500' :
                            'bg-gray-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              {byProgram.length === 0 && (
                <div className="col-span-4 text-center py-10 text-gray-400 text-sm">No program revenue data available</div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Activity ──────────────────────────────────────────────────── */}
        {!loading && activeTab === 'activity' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Recent Payment Activity</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last {recentActivity.length} transactions</p>
            </div>
            <div className="divide-y divide-gray-50">
              {recentActivity.length === 0 && (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">No payment activity yet</div>
              )}
              {recentActivity.map((item) => {
                const isPaid = item.status === 'paid' || item.status == null
                const isFailed = item.status === 'failed'
                const isRefund = item.status === 'refunded' || item.amount < 0
                return (
                  <div key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="mt-1 shrink-0">
                      {isPaid && !isRefund && <CheckCircle size={16} className="text-green-500" />}
                      {isFailed && <AlertCircle size={16} className="text-red-500" />}
                      {!isPaid && !isFailed && <Clock size={16} className="text-amber-400" />}
                      {isRefund && <AlertCircle size={16} className="text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.date}
                        {item.paymentSource && <span className="ml-2 text-gray-300">via {item.paymentSource}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-sm font-semibold ${
                        isRefund || item.amount < 0 ? 'text-red-500' :
                        isPaid ? 'text-green-600' :
                        'text-amber-500'
                      }`}>
                        {item.amount < 0 ? '-' : ''}{fmt(Math.abs(item.amount))}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-medium">{item.status || 'paid'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
