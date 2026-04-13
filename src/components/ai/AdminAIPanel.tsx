'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X, Send, Loader2, User, ChevronDown, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Msg { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; isSystem?: boolean }

// ─── Page context registry ────────────────────────────────────────────────────
interface PageCtx { label: string; starters: string[] }

const PAGE_CONTEXTS: Record<string, PageCtx> = {
  '/admin': {
    label: 'Admin Hub',
    starters: ['How is the pipeline doing?', 'Who needs follow-up today?', 'Show me a revenue summary', 'Any members at risk?'],
  },
  '/admin/activity': {
    label: 'Activity Log',
    starters: ['What happened today?', 'Show me recent admin actions', 'Any unusual activity?', 'Who was most active this week?'],
  },
  '/admin/members': {
    label: 'Members',
    starters: ['How many active members do we have?', 'Who signed up recently?', 'Any billing issues?', 'Show program breakdown'],
  },
  '/admin/operations': {
    label: 'Operations',
    starters: ['Who needs follow-up?', 'Show overdue tasks', "What's the team workload?", 'Any clients at risk?'],
  },
  '/admin/support': {
    label: 'Support Tickets',
    starters: ['Any open tickets?', 'Show me unanswered messages', "What's the average response time?", 'Reply to the oldest ticket'],
  },
  '/admin/crm': {
    label: 'CRM',
    starters: ['Who should I call next?', 'How many leads are in each stage?', 'Who has a follow-up due today?', 'Which leads are unresponsive?'],
  },
  '/admin/dialer': {
    label: 'Dialer',
    starters: ['Give me a quick talk track', 'How do I handle objections?', 'What should I say on voicemail?', 'Who am I calling today?'],
  },
  '/admin/crm/import': {
    label: 'CSV Import',
    starters: ['How many leads have I imported?', 'What format does the CSV need to be?', 'Check for duplicate imports', 'Show import history'],
  },
  '/admin/crm/campaign': {
    label: 'AI Campaign',
    starters: ['How is the current campaign doing?', 'How many leads were contacted?', 'Any bounce-backs or errors?', 'Start a new campaign'],
  },
  '/admin/revenue': {
    label: 'Revenue & Billing',
    starters: ["What's our MRR?", 'Any failed payments?', 'Show revenue this month', "Who hasn't paid?"],
  },
  '/admin/training': {
    label: 'Video Training',
    starters: ['What videos are uploaded?', 'Help me write a video title', 'What topics should I add?', 'How many members have watched?'],
  },
  '/admin/voice': {
    label: 'Voice AI',
    starters: ['How are my campaigns performing?', 'Show recent call outcomes', 'Any failed calls?', "What's my answer rate?"],
  },
  '/admin/voice/campaigns': {
    label: 'Voice Campaigns',
    starters: ['Show all campaigns', 'Which campaigns are active?', 'How many calls were made today?', 'Pause a campaign'],
  },
  '/admin/voice/campaigns/new': {
    label: 'New Campaign',
    starters: ['What should I name this campaign?', 'How many leads should I add?', 'What script works best?', 'When should I schedule this?'],
  },
  '/admin/voice/analytics': {
    label: 'Voice Analytics',
    starters: ['What is my connect rate?', 'Show best calling hours', 'Which campaign performed best?', 'What dispositions are most common?'],
  },
  '/admin/voice/logs': {
    label: 'Call Logs',
    starters: ['Show recent calls', 'How many connected today?', 'Show failed calls', 'Any DNC requests?'],
  },
  '/admin/voice/leads': {
    label: 'Voice Leads',
    starters: ['How many leads are loaded?', 'Show uncontacted leads', 'Any leads with bad numbers?', 'Import more leads'],
  },
  '/admin/voice/live': {
    label: 'Live Calls',
    starters: ['How many calls are active right now?', 'Show live call status', 'Any calls in progress?', 'Stop all calls'],
  },
  '/admin/voice/settings': {
    label: 'Voice Settings',
    starters: ['What is my caller ID set to?', 'Check my Bland AI config', 'Update my voicemail drop', 'Show current settings'],
  },
  '/admin/voice/templates': {
    label: 'Voice Templates',
    starters: ['Show all templates', 'Help me write a new script', 'Which template converts best?', 'Create a follow-up template'],
  },
  '/admin/voice/suppression': {
    label: 'Suppression List',
    starters: ['How many numbers are suppressed?', 'Add a number to DNC', 'Show recent suppressions', 'Export suppression list'],
  },
  '/admin/affiliates': {
    label: 'Affiliates',
    starters: ['How many active affiliates?', 'Who has pending commissions?', 'Show top performers', 'Any flagged affiliates?'],
  },
  '/admin/affiliates/applications': {
    label: 'Affiliate Applications',
    starters: ['Any new applications?', 'Show pending approvals', 'How many applied this week?', 'Approve or reject an application'],
  },
  '/admin/affiliates/commissions': {
    label: 'Commissions',
    starters: ['What commissions are pending?', 'Show this month totals', 'Who earned the most?', 'Any disputed commissions?'],
  },
  '/admin/affiliates/payouts': {
    label: 'Payouts',
    starters: ['Any payouts ready to run?', 'Show pending payout amounts', 'Who is owed money?', 'Run payouts now'],
  },
  '/admin/affiliates/leads': {
    label: 'Affiliate Leads',
    starters: ['How many leads came from affiliates?', 'Which affiliate sent the most leads?', 'Show unconverted affiliate leads', 'Any new leads today?'],
  },
  '/admin/affiliates/resources': {
    label: 'Affiliate Resources',
    starters: ['What resources are available?', 'Add a new resource', 'Which resources are most used?', 'Update resource links'],
  },
  '/admin/affiliates/training': {
    label: 'Affiliate Training',
    starters: ['What training videos are uploaded?', 'Add a new training module', 'Which videos are most watched?', 'Help write a training description'],
  },
  '/admin/affiliates/settings': {
    label: 'Affiliate Settings',
    starters: ['What is the current commission rate?', 'Update payout threshold', 'Show cookie duration setting', 'Configure tier structure'],
  },
  '/admin/affiliates/flags': {
    label: 'Affiliate Flags',
    starters: ['Who is flagged?', 'Show recent flags', 'Resolve a flag', 'What triggered the flags?'],
  },
  '/admin/intelligence': {
    label: 'Business Intelligence',
    starters: ['Give me a business summary', 'What are my top opportunities?', 'Where are we losing leads?', "What's trending?"],
  },
  '/admin/opportunities': {
    label: 'Opportunities',
    starters: ['Show all open opportunities', 'Which have the highest value?', 'What needs follow-up?', 'Add a new opportunity'],
  },
  '/admin/chargeback-defense': {
    label: 'Chargeback Defense',
    starters: ['Any active chargebacks?', 'What evidence do I have?', 'Show dispute timeline', 'Help write a rebuttal'],
  },
  '/admin/ai-controls': {
    label: 'AI Controls',
    starters: ['What are the current AI credit limits?', 'Show usage by member', 'Update credit limits', 'Any members over budget?'],
  },
}

const MEMBER_PAGE_STARTERS = [
  "What stage is he in?",
  "Send him an email",
  "Why didn't I get notified?",
  "Update his admin notes",
]

const LEAD_PAGE_STARTERS = [
  "What stage is this lead in?",
  "Log a call with them",
  "Set a follow-up for tomorrow",
  "Move them to qualified",
]

const AFFILIATE_PAGE_STARTERS = [
  "How much has this affiliate earned?",
  "How many referrals have they sent?",
  "Show their commission history",
  "Update their notes",
]

const VOICE_CAMPAIGN_PAGE_STARTERS = [
  "How is this campaign performing?",
  "How many calls were made?",
  "Show the connect rate",
  "Pause or resume this campaign",
]

function getPageCtx(pathname: string, contextType: 'member' | 'lead' | 'affiliate' | 'voice_campaign' | null): PageCtx {
  if (contextType === 'member')         return { label: 'Member Detail',         starters: MEMBER_PAGE_STARTERS }
  if (contextType === 'lead')           return { label: 'Lead Detail',            starters: LEAD_PAGE_STARTERS }
  if (contextType === 'affiliate')      return { label: 'Affiliate Detail',       starters: AFFILIATE_PAGE_STARTERS }
  if (contextType === 'voice_campaign') return { label: 'Campaign Detail',        starters: VOICE_CAMPAIGN_PAGE_STARTERS }

  const exact = PAGE_CONTEXTS[pathname]
  if (exact) return exact

  // Try longest prefix match
  const sortedKeys = Object.keys(PAGE_CONTEXTS).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (pathname.startsWith(key + '/')) return PAGE_CONTEXTS[key]
  }
  return PAGE_CONTEXTS['/admin']
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminAIPanel() {
  const pathname = usePathname()
  const [open, setOpen]             = useState(false)
  const [messages, setMessages]     = useState<Msg[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [showStarters, setShowStarters] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  // Extract context from the current URL
  // Members live at /admin/members/[id] OR /admin/client-view/[id]
  // Leads live at /admin/crm/[uuid] — only match real UUIDs to avoid false positives like /admin/crm/dialer
  // Affiliates live at /admin/affiliates/[uuid]
  // Voice campaigns live at /admin/voice/campaigns/[uuid]
  const memberMatch    = pathname.match(/\/admin\/(?:members|client-view)\/([^/]+)/)
  const leadMatch      = pathname.match(/\/admin\/crm\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)
  const affiliateMatch = pathname.match(/\/admin\/affiliates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)
  const voiceCampMatch = pathname.match(/\/admin\/voice\/campaigns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)

  const contextId   = memberMatch?.[1] ?? leadMatch?.[1] ?? affiliateMatch?.[1] ?? voiceCampMatch?.[1] ?? null
  const contextType = memberMatch ? 'member' : leadMatch ? 'lead' : affiliateMatch ? 'affiliate' : voiceCampMatch ? 'voice_campaign' : null

  const pageCtx = getPageCtx(pathname, contextType)
  const hideMobileLauncher =
    pathname.startsWith('/admin/dialer') ||
    Boolean(leadMatch)
  const mobileLauncherBottomClass =
    pathname.startsWith('/admin/crm') || pathname.startsWith('/admin/voice')
      ? 'bottom-20'
      : 'bottom-4'

  // Scroll to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  // Focus input on open
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150) }, [open])

  // Initial greeting on first open
  useEffect(() => {
    if (!open || initialized) return
    setInitialized(true)
    const contextNote = contextType
      ? `\n\nI can see you're on **${pageCtx.label}** — I have their full profile loaded. Just ask.`
      : `\n\nYou're on **${pageCtx.label}**. What do you need?`
    setMessages([{
      id: uuidv4(),
      role: 'assistant',
      content: `Hey Abel 👋 I'm your Admin AI — I follow you across every page and know exactly what you're looking at.${contextNote}`,
      timestamp: new Date().toISOString(),
    }])
  }, [open, initialized, pageCtx.label, contextType])

  // Page/context change — update greeting message and starters whenever pathname changes
  const prevPathRef = useRef(pathname)
  useEffect(() => {
    if (!initialized || pathname === prevPathRef.current) return
    prevPathRef.current = pathname
    const ctx = getPageCtx(pathname, contextType)
    const note = contextType
      ? `_(Switched to **${ctx.label}** — profile loaded. Ask me anything about them.)_`
      : `_(Now on **${ctx.label}**)_`
    setMessages(prev => [...prev, {
      id: uuidv4(),
      role: 'assistant',
      content: note,
      timestamp: new Date().toISOString(),
      isSystem: true,
    }])
    setShowStarters(true)
  }, [pathname, initialized, contextType])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setShowStarters(false)
    setInput('')

    const userMsg: Msg = { id: uuidv4(), role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const history = [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content }))

    try {
      const res  = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          page_context: { page: pathname, label: pageCtx.label },
          context_id: contextId,
          context_type: contextType,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: 'assistant',
        content: data.message || 'Something went wrong.',
        timestamp: new Date().toISOString(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: 'assistant',
        content: 'Connection error. Try again.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, pathname, pageCtx.label, contextId, contextType])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <>
      {/* ── Mobile overlay ── */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* ── Chat panel ── */}
      <div className={cn(
        'fixed z-50 flex flex-col bg-white dark:bg-gray-900 shadow-2xl transition-all duration-300 ease-in-out',
        'lg:bottom-6 lg:right-6 lg:w-[420px] lg:rounded-2xl lg:border lg:border-gray-200 dark:lg:border-gray-700',
        'bottom-0 right-0 left-0 lg:left-auto rounded-t-2xl lg:rounded-2xl',
        open
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-8 lg:translate-y-4 pointer-events-none',
        open ? 'h-[88vh] lg:h-[600px]' : 'h-0 overflow-hidden',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-950 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <span className="text-white font-semibold text-sm">Admin AI</span>
            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 text-xs">{pageCtx.label}</span>
          </div>
          <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Smart starters */}
        {showStarters && messages.length <= 1 && (
          <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto flex-shrink-0 scrollbar-hide">
            {pageCtx.starters.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors whitespace-nowrap">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-gray-950 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={10} className="text-indigo-400" />
                </div>
              )}
              <div className={cn(
                'max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm',
                msg.isSystem && 'bg-transparent text-gray-400 text-xs italic px-0 py-0',
              )}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={10} className="text-white" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-gray-950 flex items-center justify-center flex-shrink-0">
                <Bot size={10} className="text-indigo-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your business…"
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none max-h-24 min-h-[20px]"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = `${Math.min(t.scrollHeight, 96)}px`
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0"
            >
              {loading ? <Loader2 size={13} className="text-white animate-spin" /> : <Send size={13} className="text-white" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1.5">Admin AI · Full access · Opus 4.6</p>
        </div>
      </div>

      {/* ── Floating launcher ── */}
      {!open && (
        <>
          <button
            onClick={() => setOpen(true)}
            className="hidden lg:flex fixed z-50 items-center gap-2 px-4 py-3 rounded-full shadow-lg bg-gray-950 hover:bg-gray-900 text-white transition-all duration-200 hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
          >
            <Bot size={16} className="text-indigo-400" />
            <span className="text-sm font-semibold">Admin AI</span>
            {messages.length > 1 && <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />}
          </button>

          <button
            onClick={() => setOpen(true)}
            className={cn(
              'lg:hidden fixed right-4 z-50 w-14 h-14 rounded-full bg-gray-950 hover:bg-gray-900 text-white shadow-xl flex items-center justify-center transition-all duration-200 active:scale-95',
              hideMobileLauncher ? 'hidden' : mobileLauncherBottomClass,
            )}
          >
            <Bot size={20} className="text-indigo-400" />
          </button>

        </>
      )}

      {/* ── Hide button (desktop, panel open) ── */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="hidden lg:flex fixed z-50 bottom-6 right-[444px] items-center gap-1.5 px-3 py-2 rounded-full bg-gray-950 text-white text-xs shadow-lg hover:bg-gray-900 transition-colors"
        >
          <ChevronDown size={12} />
          <span>Hide</span>
        </button>
      )}
    </>
  )
}
