'use client'
import { useEffect, useState } from 'react'
import { Users, Mail, CheckCircle2, Clock, Trash2, RefreshCw, Loader2, XCircle, UserPlus, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

interface AccountUser {
  id: string
  email: string
  status: 'invited' | 'active' | 'removed'
  invited_at: string | null
  accepted_at: string | null
  user_id: string | null
}

interface AccountContext {
  role: 'owner' | 'delegate'
  account: {
    id: string
    owner: { user_id: string; name: string; email: string }
    delegate: AccountUser | null
  }
}

export default function DelegateAccessPanel() {
  const [ctx, setCtx] = useState<AccountContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resending, setResending] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)

  const fetchCtx = async () => {
    const res = await fetch('/api/delegate')
    if (res.ok) {
      const data = await res.json()
      setCtx(data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchCtx() }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/delegate/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Invite sent to ${inviteEmail}`)
        setInviteEmail('')
        setShowInviteForm(false)
        fetchCtx()
      } else {
        toast.error(data.error || 'Failed to send invite')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setInviting(false)
  }

  const handleRemove = async () => {
    const delegate = ctx?.account.delegate
    if (!delegate) return
    if (!confirm(`Remove delegate access for ${delegate.email}? They will immediately lose portal access.`)) return
    setRemoving(true)
    try {
      const res = await fetch('/api/delegate/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_user_id: delegate.id }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Delegate access removed.')
        fetchCtx()
      } else {
        toast.error(data.error || 'Failed to remove delegate')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setRemoving(false)
  }

  const handleResend = async () => {
    const delegate = ctx?.account.delegate
    if (!delegate) return
    setResending(true)
    try {
      const res = await fetch('/api/delegate/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_user_id: delegate.id }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Invite resent successfully.')
      } else {
        toast.error(data.error || 'Failed to resend invite')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setResending(false)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
          <Users size={15} className="text-green-600" />
          <h2 className="text-sm font-semibold text-gray-900">Assistant Access</h2>
        </div>
        <div className="p-6 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      </div>
    )
  }

  if (!ctx) return null

  // Delegate view — read-only
  if (ctx.role === 'delegate') {
    return (
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-50 flex items-center gap-2 bg-blue-50/40">
          <Shield size={15} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-blue-900">Delegate Access</h2>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase">Delegate</span>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-3">
            You have delegate access to this account. You can help with tasks, documents, AI tools, and support.
          </p>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-semibold">Account Owner</p>
            <p className="text-sm font-semibold text-gray-900">{ctx.account.owner.name || ctx.account.owner.email}</p>
            <p className="text-xs text-gray-400">{ctx.account.owner.email}</p>
          </div>
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700">Billing and subscription management are restricted to the account owner.</p>
          </div>
        </div>
      </div>
    )
  }

  // Owner view
  const delegate = ctx.account.delegate

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
        <Users size={15} className="text-green-600" />
        <h2 className="text-sm font-semibold text-gray-900">Assistant Access</h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-500 leading-relaxed">
          Invite one assistant, spouse, or team member to help with tasks, documents, and reports — without sharing your login credentials.
        </p>

        {/* Primary Owner Row */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Account Users</p>
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
            <div className="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center shrink-0">
              <span className="text-green-800 font-bold text-xs">
                {ctx.account.owner.name?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{ctx.account.owner.name || ctx.account.owner.email}</p>
              <p className="text-xs text-gray-500 truncate">{ctx.account.owner.email}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full uppercase shrink-0">Owner</span>
          </div>

          {/* Delegate row */}
          {delegate ? (
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                {delegate.status === 'active'
                  ? <CheckCircle2 size={16} className="text-green-600" />
                  : <Clock size={16} className="text-amber-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{delegate.email}</p>
                <p className="text-xs text-gray-400">
                  {delegate.status === 'invited' ? `Invite sent ${delegate.invited_at ? new Date(delegate.invited_at).toLocaleDateString() : ''}` : `Active since ${delegate.accepted_at ? new Date(delegate.accepted_at).toLocaleDateString() : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {delegate.status === 'invited' && (
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    title="Resend invite"
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
                  >
                    {resending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${delegate.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {delegate.status}
                </span>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  title="Remove delegate"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors ml-1"
                >
                  {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 border border-dashed border-gray-200 rounded-xl px-4 py-3 text-gray-400">
              <XCircle size={16} className="shrink-0" />
              <p className="text-sm">No delegate assigned</p>
            </div>
          )}
        </div>

        {/* Invite Form */}
        {!delegate && !showInviteForm && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="flex items-center gap-2 text-sm text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-4 py-2.5 rounded-xl font-semibold transition-colors w-full justify-center"
          >
            <UserPlus size={15} />
            Invite Assistant
          </button>
        )}

        {!delegate && showInviteForm && (
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Mail size={11} /> Assistant Email</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="assistant@example.com"
                required
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                disabled={inviting}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={inviting}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Send Invite
              </button>
              <button
                type="button"
                onClick={() => { setShowInviteForm(false); setInviteEmail('') }}
                className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2.5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="text-xs text-gray-400 leading-relaxed">
          Your delegate can access tasks, documents, reports, AI tools, and support. They cannot make billing changes, cancel your subscription, or transfer account ownership.
        </p>
      </div>
    </div>
  )
}
