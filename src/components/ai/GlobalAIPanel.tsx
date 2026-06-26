'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X, Send, Loader2, Bot, User, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage } from '@/types'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

// ─── Page context registry ────────────────────────────────────────────────────
interface PageStarter { key: string; fallback: string }
interface PageCtx { labelKey: string; label: string; starters: PageStarter[] }

const PAGE_CONTEXTS: Record<string, PageCtx> = {
  '/dashboard': {
    labelKey: 'ai.context.dashboard',
    label: 'Dashboard',
    starters: [
      { key: 'ai.starters.next', fallback: 'What should I do next?' },
      { key: 'ai.starters.summarizeStatus', fallback: 'Summarize my current status' },
      { key: 'ai.starters.blocking', fallback: "What's blocking me?" },
      { key: 'ai.starters.onTrack', fallback: 'Am I on track?' },
    ],
  },
  '/opportunities': {
    labelKey: 'ai.context.opportunities',
    label: 'Opportunities',
    starters: [
      { key: 'ai.starters.applyFor', fallback: 'What should I apply for?' },
      { key: 'ai.starters.whyLocked', fallback: 'Why is this opportunity locked?' },
      { key: 'ai.starters.readyApply', fallback: 'Am I ready to apply?' },
      { key: 'ai.starters.bestCard', fallback: 'Which card is best right now?' },
    ],
  },
  '/business-credit': {
    labelKey: 'ai.context.businessCredit',
    label: 'Business Credit Monitoring',
    starters: [
      { key: 'ai.starters.explainScores', fallback: 'Explain my current scores' },
      { key: 'ai.starters.lastSync', fallback: 'What changed after my last sync?' },
      { key: 'ai.starters.improvePaydex', fallback: 'What should I do to improve my PAYDEX?' },
      { key: 'ai.starters.readyBusinessCards', fallback: 'Am I ready for business cards?' },
    ],
  },
  '/credit-disputes': {
    labelKey: 'ai.context.creditDisputes',
    label: 'Credit Disputes',
    starters: [
      { key: 'ai.starters.disputeItems', fallback: 'What items should I dispute?' },
      { key: 'ai.starters.disputeTime', fallback: 'How long does a dispute take?' },
      { key: 'ai.starters.bureauFocus', fallback: 'What bureau should I focus on?' },
    ],
  },
  '/underwriting': {
    labelKey: 'ai.context.underwriting',
    label: 'Underwriting',
    starters: [
      { key: 'ai.starters.missingDocument', fallback: 'What document am I missing?' },
      { key: 'ai.starters.underwritingIncomplete', fallback: 'Why is underwriting incomplete?' },
      { key: 'ai.starters.needUpload', fallback: 'What do I need to upload?' },
    ],
  },
  '/billing': {
    labelKey: 'ai.context.billing',
    label: 'Billing',
    starters: [
      { key: 'ai.starters.nextPayment', fallback: 'Explain my next payment' },
      { key: 'ai.starters.autoDraft', fallback: 'When is auto-draft?' },
      { key: 'ai.starters.planIncludes', fallback: 'What does my plan include?' },
    ],
  },
  '/documents': {
    labelKey: 'ai.context.documents',
    label: 'Documents',
    starters: [
      { key: 'ai.starters.documentsNeed', fallback: 'What documents do I still need?' },
      { key: 'ai.starters.documentsReview', fallback: 'Which documents are under review?' },
      { key: 'ai.starters.uploadNext', fallback: 'What should I upload next?' },
    ],
  },
  '/progress': {
    labelKey: 'ai.context.progress',
    label: 'Progress',
    starters: [
      { key: 'ai.starters.overdueTasks', fallback: 'What tasks are overdue?' },
      { key: 'ai.starters.completeWeek', fallback: 'What should I complete this week?' },
      { key: 'ai.starters.howFar', fallback: 'How far along am I?' },
    ],
  },
  '/funding-results': {
    labelKey: 'ai.context.fundingResults',
    label: 'Funding Results',
    starters: [
      { key: 'ai.starters.approvedAmount', fallback: 'How much have I been approved for?' },
      { key: 'ai.starters.withApprovals', fallback: 'What should I do with my approvals?' },
      { key: 'ai.starters.nextFunding', fallback: 'What is my next funding step?' },
    ],
  },
  '/reports': {
    labelKey: 'ai.context.reports',
    label: 'Reports',
    starters: [
      { key: 'ai.starters.latestReport', fallback: 'Explain my latest report' },
      { key: 'ai.starters.numbersMean', fallback: 'What do my numbers mean?' },
      { key: 'ai.starters.improveScore', fallback: 'How do I improve my score?' },
    ],
  },
  '/support': {
    labelKey: 'ai.context.support',
    label: 'Support',
    starters: [
      { key: 'ai.starters.accountHelp', fallback: 'I need help with my account' },
      { key: 'ai.starters.explainProgram', fallback: 'Can you explain my program?' },
    ],
  },
}

function getPageCtx(pathname: string): PageCtx {
  // Exact match first, then prefix match
  const exact = PAGE_CONTEXTS[pathname]
  if (exact) return exact
  for (const [key, ctx] of Object.entries(PAGE_CONTEXTS)) {
    if (pathname.startsWith(key)) return ctx
  }
  return {
    labelKey: 'ai.context.portal',
    label: 'Portal',
    starters: [
      { key: 'ai.starters.next', fallback: 'What should I do next?' },
      { key: 'ai.starters.understandStatus', fallback: 'Help me understand my status' },
      { key: 'ai.starters.nextStep', fallback: 'What is my next step?' },
    ],
  }
}

// ─── Markdown → HTML (minimal) ───────────────────────────────────────────────
function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface GlobalAIPanelProps {
  assignedProgram?: string | null
  accountState?: 'prospect' | 'active_member'
  userName?: string
  defaultOpen?: boolean
}

export default function GlobalAIPanel({ assignedProgram, accountState, userName, defaultOpen = false }: GlobalAIPanelProps) {
  const { locale } = useLanguage()
  const text = useCallback((key: string, fallback: string) => t(locale, key, fallback), [locale])
  const pathname = usePathname()
  const [open, setOpen] = useState(defaultOpen)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showStarters, setShowStarters] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const pageCtx = getPageCtx(pathname)
  const pageLabel = text(pageCtx.labelKey, pageCtx.label)
  const pageStarters = pageCtx.starters.map(starter => ({
    ...starter,
    text: text(starter.key, starter.fallback),
  }))

  // Hide on the full agent page (redundant)
  const isAgentPage = pathname === '/agent'

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // Load conversation on first open
  useEffect(() => {
    if (!open || initialized) return
    const load = async () => {
      try {
        const res = await fetch('/api/agent/conversation')
        if (!res.ok) return
        const data = await res.json()
        setConversationId(data.conversation_id ?? null)
        const prior: ChatMessage[] = (data.messages ?? []).map((m: {
          id: string; role: string; content: string; created_at: string
        }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.created_at,
        }))
        if (prior.length > 0) {
          setMessages(prior)
          setShowStarters(false)
        } else {
          // Initial greeting
          const firstName = (userName || 'there').split(' ')[0]
          setMessages([{
            id: uuidv4(),
            role: 'assistant',
            content: text('ai.greeting', 'Hi {name}! I am your AI assistant. I can see you are on the **{page}** page.\n\nHow can I help you right now?')
              .replace('{name}', firstName)
              .replace('{page}', pageLabel),
            timestamp: new Date().toISOString(),
          }])
        }
      } catch {
        // silent fail — panel still works without history
      } finally {
        setInitialized(true)
      }
    }
    load()
  }, [open, initialized, userName, pageLabel, text])

  // Inject updated page context when pathname changes (while panel is open)
  const prevPathRef = useRef(pathname)
  useEffect(() => {
    if (!open || !initialized || pathname === prevPathRef.current) return
    prevPathRef.current = pathname
    const newCtx = getPageCtx(pathname)
    const newPageLabel = text(newCtx.labelKey, newCtx.label)
    const firstStarter = newCtx.starters[0]
      ? text(newCtx.starters[0].key, newCtx.starters[0].fallback)
      : text('ai.starters.next', 'What should I do next?')
    // Add a subtle context-change notice
    setMessages(prev => [...prev, {
      id: uuidv4(),
      role: 'assistant',
      content: text('ai.contextSwitched', '_(Switched to **{page}**)_ - {starter}? I am ready to help.')
        .replace('{page}', newPageLabel)
        .replace('{starter}', firstStarter),
      timestamp: new Date().toISOString(),
      isSystem: true,
    } as ChatMessage & { isSystem?: boolean }])
    setShowStarters(true)
  }, [pathname, open, initialized, text])

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmed = messageText.trim()
    if (!trimmed || loading) return

    setShowStarters(false)
    setInput('')

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Build message history for the server-side LLM route (last 20 messages)
    const history = [...messages, userMsg].slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          action_type: 'simple_chat',
          page_context: {
            page: pathname,
            label: pageLabel,
          },
        }),
      })

      const data = await res.json()
      const aiContent = data.message || text('ai.errorGeneric', 'Something went wrong. Please try again.')

      const aiMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: aiContent,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, aiMsg])

      // Persist both messages
      if (conversationId) {
        fetch('/api/agent/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId,
            messages: [
              { role: 'user', content: trimmed },
              { role: 'assistant', content: aiContent },
            ],
          }),
        }).catch(() => {})
      }
    } catch {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: 'assistant',
        content: text('ai.errorConnection', 'Connection error. Please try again.'),
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, pathname, pageLabel, conversationId, text])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  if (isAgentPage) return null

  return (
    <>
      {/* ── Overlay (mobile) ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Panel ── */}
      <div
        className={cn(
          'fixed z-40 lg:z-30 flex flex-col bg-white dark:bg-gray-900 shadow-2xl transition-all duration-300 ease-in-out',
          // Desktop: side panel from right
          'lg:bottom-6 lg:right-6 lg:w-[420px] lg:rounded-2xl lg:border lg:border-gray-200 dark:lg:border-gray-700',
          // Mobile: bottom sheet
          'bottom-0 right-0 left-0 lg:left-auto rounded-t-2xl lg:rounded-2xl',
          open
            ? 'opacity-100 translate-y-0 lg:translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-8 lg:translate-y-4 pointer-events-none',
          // Height
          open ? 'h-[88vh] lg:h-[600px]' : 'h-0 overflow-hidden',
        )}
        style={{ maxHeight: open ? '92vh' : 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="text-white font-semibold text-sm">{text('ai.assistantTitle', 'AI Assistant')}</span>
            <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs">
              {pageLabel}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Smart starters */}
        {showStarters && messages.length <= 1 && (
          <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto flex-shrink-0 scrollbar-hide">
            {pageStarters.map(s => (
              <button
                key={s.key}
                onClick={() => sendMessage(s.text)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors whitespace-nowrap"
              >
                {s.text}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={10} className="text-green-400" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-green-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm',
                  (msg as ChatMessage & { isSystem?: boolean }).isSystem && 'bg-transparent text-gray-400 dark:text-gray-500 text-xs italic px-0 py-0',
                )}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={10} className="text-white" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                <Sparkles size={10} className="text-green-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={text('ai.placeholder', 'Ask anything...')}
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none max-h-24 min-h-[20px]"
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
              className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center disabled:opacity-40 hover:bg-green-700 transition-colors flex-shrink-0"
            >
              {loading ? <Loader2 size={13} className="text-white animate-spin" /> : <Send size={13} className="text-white" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating launcher button ── */}
      {!open && (
        <>
          <button
            onClick={() => setOpen(true)}
            className={cn(
              'hidden lg:flex fixed z-30 items-center gap-2 px-4 py-3 rounded-full shadow-lg',
              'bg-gray-900 hover:bg-gray-800 text-white transition-all duration-200 hover:scale-105 active:scale-95',
              'lg:bottom-6 lg:right-6',
            )}
          >
            <Sparkles size={16} className="text-green-400" />
            <span className="text-sm font-semibold">AI</span>
            {messages.length > 1 && (
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden fixed right-4 bottom-20 z-30 w-14 h-14 rounded-full bg-gray-900 hover:bg-gray-800 text-white shadow-xl flex items-center justify-center transition-all duration-200 active:scale-95"
          >
            <Sparkles size={20} className="text-green-400" />
          </button>
        </>
      )}

      {/* ── Minimized tab (panel open on desktop — show a collapse button) ── */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="hidden lg:flex fixed z-30 bottom-6 right-[444px] items-center gap-1.5 px-3 py-2 rounded-full bg-gray-900 text-white text-xs shadow-lg hover:bg-gray-800 transition-colors"
        >
          <ChevronDown size={12} />
          <span>{text('ai.hide', 'Hide')}</span>
        </button>
      )}
    </>
  )
}
