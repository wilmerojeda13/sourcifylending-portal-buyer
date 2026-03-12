'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, User, Shield, ShieldOff, CheckCircle, Clock, Lock, AlertTriangle,
  FileText, BarChart2, Bell, Save, Loader2, AlertOctagon, ChevronDown, ChevronUp
} from 'lucide-react'
import type { UserProfile, Task, Document, ActivityLog, ProgramId, SubscriptionStatus, ReadinessStatus } from '@/types'
import { getProgramShortLabel } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
  profile: UserProfile & { stripe_customer_id?: string }
  subscription: {
    id: string
    stripe_subscription_id: string | null
    stripe_customer_id: string | null
    status: string
    current_period_start: string | null
    current_period_end: string | null
  } | null
  tasks: Task[]
  documents: Document[]
  activityLogs: ActivityLog[]
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'inactive']
const PROGRAM_OPTIONS: (ProgramId | '')[] = ['', 'program_a', 'program_b', 'program_c']
const READINESS_OPTIONS: (ReadinessStatus | '')[] = ['', 'Ready', 'Conditionally Ready', 'Not Ready']

const statusColors: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-600',
  inactive: 'bg-gray-100 text-gray-500',
}

export default function MemberDetail({ profile, subscription, tasks, documents, activityLogs }: Props) {
  // Profile form state
  const [form, setForm] = useState({
    subscription_status: profile.subscription_status,
    assigned_program: profile.assigned_program ?? '',
    current_stage: profile.current_stage ?? '',
    readiness_status: profile.readiness_status ?? '',
    progress_percentage: profile.progress_percentage ?? 0,
    admin_notes: profile.admin_notes ?? '',
    portal_blocked: profile.portal_blocked ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)

  // Notification form state
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sendingNotif, setSendingNotif] = useState(false)

  async function saveProfile() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          subscription_status: form.subscription_status,
          assigned_program: form.assigned_program || null,
          current_stage: form.current_stage || null,
          readiness_status: form.readiness_status || null,
          progress_percentage: Number(form.progress_percentage),
          admin_notes: form.admin_notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Profile saved')
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function togglePortalBlock() {
    const newBlocked = !form.portal_blocked
    setBlocking(true)
    try {
      const res = await fetch('/api/admin/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, portal_blocked: newBlocked }),
      })
      if (!res.ok) throw new Error('Failed')
      setForm((prev) => ({ ...prev, portal_blocked: newBlocked }))
      toast.success(newBlocked ? 'Portal access blocked' : 'Portal access restored')
    } catch {
      toast.error('Failed to update portal access')
    } finally {
      setBlocking(false)
    }
  }

  async function cancelSubscription() {
    if (!confirm('Cancel this member\'s Stripe subscription? This cannot be undone.')) return
    setCanceling(true)
    try {
      const res = await fetch('/api/admin/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          stripe_subscription_id: subscription?.stripe_subscription_id ?? null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setForm((prev) => ({ ...prev, subscription_status: 'canceled' }))
      toast.success('Subscription canceled')
    } catch {
      toast.error('Cancellation failed')
    } finally {
      setCanceling(false)
    }
  }

  async function sendNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error('Title and message are required')
      return
    }
    setSendingNotif(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.id, title: notifTitle, message: notifMessage, type: 'system' }),
      })
      if (!res.ok) throw new Error('Failed')
      setNotifTitle('')
      setNotifMessage('')
      toast.success('Notification sent!')
    } catch {
      toast.error('Failed to send notification')
    } finally {
      setSendingNotif(false)
    }
  }

  const taskStats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    locked: tasks.filter((t) => t.status === 'locked').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/members" className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
              <ArrowLeft size={18} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <User size={20} className="text-gray-500" />
                {profile.full_name || 'Unknown User'}
              </h1>
              <p className="text-sm text-gray-500">{profile.email}</p>
              {profile.business_name && (
                <p className="text-xs text-gray-400">{profile.business_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColors[form.subscription_status] ?? 'bg-gray-100 text-gray-500'}`}>
              {form.subscription_status}
            </span>
            {form.portal_blocked && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                <AlertOctagon size={12} /> Portal Blocked
              </span>
            )}
            <button
              onClick={togglePortalBlock}
              disabled={blocking}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                form.portal_blocked
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
              }`}
            >
              {blocking ? <Loader2 size={12} className="animate-spin" /> : form.portal_blocked ? <ShieldOff size={12} /> : <Shield size={12} />}
              {form.portal_blocked ? 'Unblock Portal' : 'Block Portal'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column — Profile Edit */}
          <div className="lg:col-span-2 space-y-5">

            {/* Profile Edit Form */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">Profile & Subscription</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Subscription Status
                  </label>
                  <select
                    value={form.subscription_status}
                    onChange={(e) => setForm((p) => ({ ...p, subscription_status: e.target.value as SubscriptionStatus }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Assigned Program
                  </label>
                  <select
                    value={form.assigned_program}
                    onChange={(e) => setForm((p) => ({ ...p, assigned_program: e.target.value as ProgramId | '' }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {PROGRAM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p ? getProgramShortLabel(p) : '— None —'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Current Stage
                  </label>
                  <input
                    type="text"
                    value={form.current_stage}
                    onChange={(e) => setForm((p) => ({ ...p, current_stage: e.target.value }))}
                    placeholder="e.g. Stage 1 — Foundation"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Readiness Status
                  </label>
                  <select
                    value={form.readiness_status}
                    onChange={(e) => setForm((p) => ({ ...p, readiness_status: e.target.value as ReadinessStatus | '' }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {READINESS_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r || '— None —'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Progress % (0–100)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress_percentage}
                    onChange={(e) => setForm((p) => ({ ...p, progress_percentage: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Admin Notes (internal only)
                  </label>
                  <textarea
                    value={form.admin_notes}
                    onChange={(e) => setForm((p) => ({ ...p, admin_notes: e.target.value }))}
                    placeholder="Internal notes visible only to admins…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </div>

              </div>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Changes
                </button>
                {subscription?.stripe_subscription_id && form.subscription_status !== 'canceled' && (
                  <button
                    onClick={cancelSubscription}
                    disabled={canceling}
                    className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {canceling ? <Loader2 size={14} className="animate-spin" /> : null}
                    Cancel Stripe Sub
                  </button>
                )}
              </div>
            </div>

            {/* Task Overview */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle size={18} className="text-green-600" /> Tasks
              </h2>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total', value: taskStats.total, color: 'text-gray-900' },
                  { label: 'Done', value: taskStats.completed, color: 'text-green-600' },
                  { label: 'Pending', value: taskStats.pending, color: 'text-amber-600' },
                  { label: 'Locked', value: taskStats.locked, color: 'text-gray-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center bg-gray-50 rounded-xl py-3">
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {tasks.map((t) => {
                  const Icon = t.status === 'completed' ? CheckCircle : t.status === 'locked' ? Lock : t.status === 'overdue' ? AlertTriangle : Clock
                  const iconColor = t.status === 'completed' ? 'text-green-500' : t.status === 'locked' ? 'text-gray-300' : t.status === 'overdue' ? 'text-red-500' : 'text-amber-500'
                  return (
                    <div key={t.task_id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${t.status === 'locked' ? 'opacity-50' : ''}`}>
                      <Icon size={15} className={iconColor} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${t.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {t.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{t.stage}</span>
                    </div>
                  )
                })}
                {tasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No tasks assigned</p>}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" /> Documents ({documents.length})
              </h2>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {documents.map((doc) => (
                  <div key={doc.document_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                    <FileText size={15} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{doc.file_name}</p>
                      <p className="text-[10px] text-gray-400">{doc.document_type} · {doc.review_status}</p>
                    </div>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:underline shrink-0"
                    >
                      View
                    </a>
                  </div>
                ))}
                {documents.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No documents uploaded</p>}
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="space-y-5">

            {/* Stripe Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart2 size={18} className="text-gray-500" /> Stripe
              </h2>
              <div className="space-y-2 font-mono text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">Customer: </span>
                  {subscription?.stripe_customer_id ?? <span className="text-gray-300">—</span>}
                </div>
                <div>
                  <span className="text-gray-400">Sub: </span>
                  {subscription?.stripe_subscription_id ?? <span className="text-gray-300">—</span>}
                </div>
                <div>
                  <span className="text-gray-400">Period end: </span>
                  {subscription?.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : <span className="text-gray-300">—</span>}
                </div>
              </div>
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <User size={18} className="text-gray-500" /> Account Info
              </h2>
              <div className="space-y-2 text-xs text-gray-600">
                <div><span className="text-gray-400">Joined: </span>{new Date(profile.created_at).toLocaleDateString()}</div>
                <div><span className="text-gray-400">Score range: </span>{profile.credit_score_range ?? '—'}</div>
                <div><span className="text-gray-400">Utilization: </span>{profile.utilization_range ?? '—'}</div>
                <div><span className="text-gray-400">Inquiries: </span>{profile.inquiry_range ?? '—'}</div>
                <div><span className="text-gray-400">Entity: </span>{profile.entity_type ?? '—'}</div>
                <div><span className="text-gray-400">Industry: </span>{profile.industry ?? '—'}</div>
                <div><span className="text-gray-400">Revenue: </span>{profile.monthly_revenue_range ?? '—'}</div>
              </div>
            </div>

            {/* Send Notification */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Bell size={18} className="text-amber-500" /> Send Notification
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="Notification title…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Message</label>
                  <textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Message body…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </div>
                <button
                  onClick={sendNotification}
                  disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {sendingNotif ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Send to Member
                </button>
              </div>
            </div>

            {/* Activity Log */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50"
                onClick={() => setShowActivityLog(!showActivityLog)}
              >
                <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <FileText size={16} className="text-gray-400" /> Activity Log ({activityLogs.length})
                </h2>
                {showActivityLog ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>
              {showActivityLog && (
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="px-4 py-2.5 flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 capitalize">
                          {log.event_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No activity yet</p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
