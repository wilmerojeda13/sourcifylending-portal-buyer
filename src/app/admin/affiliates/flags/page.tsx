'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Loader2, Shield, Flag, AlertTriangle, CheckCircle,
  X, Save, ChevronDown, ChevronUp
} from 'lucide-react'

interface AffiliateFlag {
  id: string
  affiliate_id: string
  flag_type: string
  reason: string
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned'
  admin_notes: string | null
  reviewed_at: string | null
  created_at: string
  affiliates?: { name: string; email: string; referral_code: string } | null
  affiliate_referrals?: { lead_name: string; lead_email: string } | null
}

type FlagStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned'

const FLAG_TYPE_COLORS: Record<string, string> = {
  self_referral: 'bg-red-100 text-red-700',
  same_payment_method: 'bg-orange-100 text-orange-700',
  ip_clustering: 'bg-orange-100 text-orange-700',
  suspicious_signup: 'bg-yellow-100 text-yellow-700',
  duplicate_email: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-500',
}

const STATUS_TABS: { value: FlagStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'text-amber-600' },
  { value: 'reviewed', label: 'Reviewed', color: 'text-blue-600' },
  { value: 'dismissed', label: 'Dismissed', color: 'text-gray-500' },
  { value: 'actioned', label: 'Actioned', color: 'text-purple-600' },
]

const SUB_NAV = [
  { label: 'Partners', href: '/admin/affiliates' },
  { label: 'Commissions', href: '/admin/affiliates/commissions' },
  { label: 'Settings', href: '/admin/affiliates/settings' },
  { label: 'Resources', href: '/admin/affiliates/resources' },
  { label: 'Flags', href: '/admin/affiliates/flags', active: true },
]

function FlagTypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${FLAG_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<AffiliateFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FlagStatus>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchFlags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/affiliates/flags?status=${activeTab}`)
      const data = await res.json()
      setFlags(data.flags ?? [])
      setExpandedId(null)
    } catch { /* no-op */ }
    setLoading(false)
  }, [activeTab])

  useEffect(() => { fetchFlags() }, [fetchFlags])

  async function handleAction(flagId: string, newStatus: FlagStatus) {
    setActionLoading(flagId)
    try {
      await fetch('/api/admin/affiliates/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: flagId,
          status: newStatus,
          admin_notes: reviewNotes[flagId] ?? '',
        }),
      })
      await fetchFlags()
    } catch { /* no-op */ }
    setActionLoading(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ChevronLeft size={14} /> Admin
          </Link>
          <span className="text-gray-300">/</span>
          <Link href="/admin/affiliates" className="text-sm text-gray-500 hover:text-gray-700">Partners</Link>
          <span className="text-gray-300">/</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fraud Flags & Reviews</h1>
            <p className="text-sm text-gray-500 mt-0.5">Review and action partner-program fraud flags</p>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {SUB_NAV.map(({ label, href, active }) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${active
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-green-700 hover:bg-green-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Flag Status Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 flex">
            {STATUS_TABS.map(({ value, label, color }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors capitalize border-b-2 ${activeTab === value
                  ? `border-indigo-600 text-indigo-700 bg-indigo-50/50`
                : 'border-transparent text-gray-500 hover:text-green-700'
                }`}
              >
                <span className={activeTab === value ? 'text-indigo-700' : color}>{label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading flags…
            </div>
          ) : flags.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Shield size={28} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium text-gray-600">No {activeTab} flags</p>
              <p className="text-sm mt-1">
                {activeTab === 'pending' ? 'All flags have been reviewed — great work!' : `No flags in "${activeTab}" status.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {flags.map(flag => {
                const isExpanded = expandedId === flag.id
                const isLoading = actionLoading === flag.id
                return (
                  <div key={flag.id}>
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : flag.id)}
                    >
                      <div className="shrink-0">
                        <AlertTriangle size={16} className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                        <div className="sm:col-span-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {flag.affiliates?.name ?? '—'}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">{flag.affiliates?.referral_code}</p>
                        </div>
                        <div className="sm:col-span-1">
                          <FlagTypeBadge type={flag.flag_type} />
                        </div>
                        <div className="sm:col-span-2 text-xs text-gray-500 truncate">{flag.reason}</div>
                        <div className="sm:col-span-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(flag.created_at)}</span>
                          {isExpanded
                            ? <ChevronUp size={15} className="text-gray-400 shrink-0" />
                            : <ChevronDown size={15} className="text-gray-400 shrink-0" />
                          }
                        </div>
                      </div>
                    </div>

                    {/* Inline Panel */}
                    {isExpanded && (
                      <div className="mx-5 mb-4 bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                        {/* Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Partner</p>
                            <Link href={`/admin/affiliates/${flag.affiliate_id}`}
                              className="font-semibold text-indigo-700 hover:underline text-sm"
                              onClick={e => e.stopPropagation()}
                            >
                              {flag.affiliates?.name}
                            </Link>
                            <p className="text-[10px] text-gray-400">{flag.affiliates?.email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Flag Type</p>
                            <FlagTypeBadge type={flag.flag_type} />
                          </div>
                          {flag.affiliate_referrals && (
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">Associated Client</p>
                              <p className="font-medium text-gray-800 text-sm">{flag.affiliate_referrals.lead_name}</p>
                              <p className="text-[10px] text-gray-400">{flag.affiliate_referrals.lead_email}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Flagged</p>
                            <p className="font-medium text-gray-800 text-sm">{fmtDate(flag.created_at)}</p>
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <p className="text-xs font-semibold text-gray-500 mb-1">Reason</p>
                          <p className="text-sm text-gray-700">{flag.reason}</p>
                        </div>

                        {/* Admin Notes */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Admin Notes</label>
                          <textarea
                            value={reviewNotes[flag.id] ?? flag.admin_notes ?? ''}
                            onChange={e => setReviewNotes(n => ({ ...n, [flag.id]: e.target.value }))}
                            rows={3}
                            placeholder="Add review notes…"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white"
                            onClick={e => e.stopPropagation()}
                          />
                        </div>

                        {/* Action Buttons */}
                        {activeTab === 'pending' && (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'reviewed') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              {isLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                              Mark Reviewed
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'dismissed') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              <X size={13} /> Dismiss
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'actioned') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              <Flag size={13} /> Action Taken
                            </button>
                          </div>
                        )}
                        {activeTab === 'reviewed' && (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'dismissed') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              <X size={13} /> Dismiss
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'actioned') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              <Flag size={13} /> Action Taken
                            </button>
                          </div>
                        )}
                        {(activeTab === 'dismissed' || activeTab === 'actioned') && (
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); handleAction(flag.id, 'pending') }}
                              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                              <AlertTriangle size={13} /> Reopen as Pending
                            </button>
                            {flag.admin_notes && (
                              <button
                                disabled={isLoading}
                                onClick={e => { e.stopPropagation(); handleAction(flag.id, activeTab) }}
                                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                              >
                                <Save size={13} /> Save Notes
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
