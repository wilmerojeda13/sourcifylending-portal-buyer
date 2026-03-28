'use client'

import { useState } from 'react'
import { MessageSquare, Send, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Paperclip, Filter, RefreshCw, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

interface SupportMessage {
  id: string
  user_id: string
  user_email: string
  subject: string
  message: string
  status: 'open' | 'replied' | 'closed'
  admin_reply?: string | null
  attachment_url?: string | null
  created_at: string
  updated_at: string
  profiles?: { full_name?: string; business_name?: string } | null
}

const STATUS_CONFIG = {
  open:    { label: 'Open',    color: 'bg-blue-100 text-blue-700',   icon: Clock },
  replied: { label: 'Replied', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  closed:  { label: 'Closed',  color: 'bg-gray-100 text-gray-500',   icon: XCircle },
}

export default function SupportAdminClient({ initialMessages }: { initialMessages: SupportMessage[] }) {
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)

  const filtered = statusFilter === 'all'
    ? messages
    : messages.filter(m => m.status === statusFilter)

  const openCount = messages.filter(m => m.status === 'open').length

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/support')
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
    } finally {
      setRefreshing(false)
    }
  }

  const sendReply = async (msg: SupportMessage) => {
    const reply = (replyText[msg.id] ?? '').trim()
    if (!reply) return
    setSending(msg.id)
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id, admin_reply: reply }),
      })
      const data = await res.json()
      if (res.ok && data.message) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...data.message } : m))
        setReplyText(prev => ({ ...prev, [msg.id]: '' }))
        setSuccessId(msg.id)
        setTimeout(() => setSuccessId(null), 4000)
      }
    } finally {
      setSending(null)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch('/api/admin/support', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const data = await res.json()
    if (res.ok && data.message) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, ...data.message } : m))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">← Admin</Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare size={22} className="text-green-600" />
              Support Inbox
              {openCount > 0 && (
                <span className="text-sm font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">{openCount} open</span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Reply to client messages — your reply is emailed and appears in their portal inbox</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          {['all', 'open', 'replied', 'closed'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize transition-colors ${statusFilter === f ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-green-400'}`}>
              {f === 'all' ? `All (${messages.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${messages.filter(m => m.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Messages */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-6 py-16 text-center">
            <MessageSquare size={28} className="text-gray-200 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(msg => {
              const cfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.open
              const StatusIcon = cfg.icon
              const isExpanded = expandedId === msg.id
              const clientName = msg.profiles?.full_name || msg.profiles?.business_name || msg.user_email

              return (
                <div key={msg.id} className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden transition-all ${msg.status === 'open' ? 'border-blue-200 dark:border-blue-700' : 'border-gray-100 dark:border-gray-700'}`}>

                  {/* Row header */}
                  <button onClick={() => setExpandedId(isExpanded ? null : msg.id)} className="w-full text-left px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{msg.subject}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                            <StatusIcon size={10} /> {cfg.label}
                          </span>
                          {msg.attachment_url && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <Paperclip size={10} /> attachment
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{clientName}</span>
                          <span className="text-gray-400 dark:text-gray-500"> · {msg.user_email} · {formatDate(msg.created_at)}</span>
                        </p>
                        {!isExpanded && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">{msg.message}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-gray-400 dark:text-gray-500 mt-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-50 dark:border-gray-700">

                      {/* Client message */}
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mt-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Client Message</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        {msg.attachment_url && (
                          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 text-xs text-green-700 font-semibold bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
                            <Paperclip size={12} /> View Attachment
                          </a>
                        )}
                      </div>

                      {/* Existing reply */}
                      {msg.admin_reply && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">Your Reply (sent to client)</p>
                          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.admin_reply}</p>
                        </div>
                      )}

                      {/* Success flash */}
                      {successId === msg.id && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
                          <CheckCircle2 size={14} className="text-green-600" />
                          <p className="text-sm text-green-700 font-medium">Reply sent — client has been notified by email and in-portal.</p>
                        </div>
                      )}

                      {/* Reply form */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2">
                          {msg.admin_reply ? 'Update Reply' : 'Reply to Client'}
                        </label>
                        <textarea
                          value={replyText[msg.id] ?? msg.admin_reply ?? ''}
                          onChange={e => setReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          rows={4}
                          placeholder="Type your reply here... It will be emailed to the client and visible in their portal inbox."
                          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none transition-all"
                        />
                        <div className="flex items-center justify-between mt-3 gap-3">
                          <div className="flex gap-2">
                            {msg.status !== 'closed' && (
                              <button onClick={() => updateStatus(msg.id, 'closed')}
                                className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                Mark Closed
                              </button>
                            )}
                            {msg.status === 'closed' && (
                              <button onClick={() => updateStatus(msg.id, 'open')}
                                className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                Reopen
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => sendReply(msg)}
                            disabled={sending === msg.id || !(replyText[msg.id] ?? '').trim()}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                          >
                            {sending === msg.id
                              ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                              : <><Send size={14} /> Send Reply</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
