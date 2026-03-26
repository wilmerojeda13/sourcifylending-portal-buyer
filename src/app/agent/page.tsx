export const dynamic = 'force-dynamic'
'use client'
import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { Send, Bot, User, RefreshCw, Loader2, WifiOff, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import type { ChatMessage, UserProfile } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const QUICK_PROMPTS = [
  "I'm lost — what do I do next?",
  "What documents are still missing?",
  "Am I ready yet?",
  "What tradelines do I still need?",
  "Explain my current stage",
  "Generate a progress summary",
]

export default function AgentPageWrapper() {
  return (
    <Suspense fallback={<PortalLayout><div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-green-400" /></div></PortalLayout>}>
      <AgentPage />
    </Suspense>
  )
}

function AgentPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const autoPrompt = searchParams.get('prompt')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [isActive, setIsActive] = useState(false)
  const [platformMaintenance, setPlatformMaintenance] = useState(false)

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [priorSummary, setPriorSummary] = useState<string | null>(null)
  const [showRolloverBanner, setShowRolloverBanner] = useState(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, convRes, { data: nextTaskData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        fetch('/api/agent/conversation'),
        supabase.from('tasks').select('title, stage').eq('user_id', user.id).eq('status', 'pending').order('sort_order').limit(1).maybeSingle(),
      ])

      setProfile(p)
      const active = p?.subscription_status === 'active' || p?.subscription_status === 'trialing'
      setIsActive(active)

      const convData = convRes.ok ? await convRes.json() : null
      const convId = convData?.conversation_id ?? null
      setConversationId(convId)

      if (convData?.was_rolled_over) {
        setPriorSummary(convData.prior_summary ?? null)
        setShowRolloverBanner(true)
      }

      // Restore previous messages from this conversation
      const priorMessages: ChatMessage[] = (convData?.messages ?? []).map((m: {
        id: string; role: string; content: string; created_at: string
      }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at,
      }))

      if (priorMessages.length === 0) {
        const firstName = (p?.full_name || 'there').split(' ')[0]
        let greetingText = ''
        if (active) {
          if (nextTaskData?.title) {
            greetingText = `Hi ${firstName}! 👋 I'm your AI Fulfillment Agent for the **${getProgramShortLabel(p?.assigned_program)}** program.\n\nYour next task is: **"${nextTaskData.title}"** (${nextTaskData.stage}).\n\nWant me to walk you through it step by step? Just say **"yes"** or ask me anything about your program.`
          } else {
            greetingText = `Hi ${firstName}! 👋 I'm your AI Fulfillment Agent for the **${getProgramShortLabel(p?.assigned_program)}** program.\n\nI have full visibility into your tasks, documents, and progress. Ask me anything — or tap one of the quick prompts below to get started.`
          }
        } else {
          greetingText = `Hi there! Your subscription is currently inactive, so my capabilities are limited. Please **reactivate your subscription** to access full AI fulfillment guidance.\n\nI can still answer general questions about your program.`
        }
        const greeting: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: greetingText,
          timestamp: new Date().toISOString(),
        }
        setMessages([greeting])
      } else {
        setMessages(priorMessages)
      }

      setInitializing(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const persistMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!conversationId) return
    fetch('/api/agent/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, role, content }),
    }).catch(() => {})
  }, [conversationId])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    persistMessage('user', userMsg.content)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()

      if (data.platform_maintenance) {
        setPlatformMaintenance(true)
        setLoading(false)
        return
      }

      const aiContent = data.message || 'I encountered an error. Please try again.'
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: aiContent,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      persistMessage('assistant', aiContent)
    } catch {
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again in a moment.',
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errMsg])
    }
    setLoading(false)
  }, [messages, loading, persistMessage])

  // Auto-send prompt when arriving from "Ask AI" button on a task
  const autoPromptSentRef = useRef(false)
  useEffect(() => {
    if (!autoPrompt || initializing || autoPromptSentRef.current) return
    autoPromptSentRef.current = true
    sendMessage(autoPrompt)
  }, [autoPrompt, initializing, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    const greeting: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: `Chat cleared. I still have your full profile and progress context. What would you like to work on?`,
      timestamp: new Date().toISOString(),
    }
    setMessages([greeting])
  }

  const hasHistory = messages.length > 1

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
    >
      <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Bot size={24} className="text-green-500" /> AI Fulfillment Agent
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
              {profile?.assigned_program ? getProgramShortLabel(profile.assigned_program) : 'AI-powered guidance for your credit journey'}
              {hasHistory && (
                <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded-full">
                  <History size={10} /> Saved
                </span>
              )}
            </p>
          </div>
          <button onClick={clearChat} className="btn-secondary text-xs px-3 py-2">
            <RefreshCw size={14} /> Clear
          </button>
        </div>

        {/* Rollover Banner */}
        {showRolloverBanner && (
          <div className="shrink-0 mb-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                  <History size={14} /> Continuing where you left off
                </p>
                {priorSummary ? (
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    <strong>Prior session summary:</strong> {priorSummary}
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 mt-1">
                    Your previous conversation was archived to keep things organized. Your progress and context are fully preserved.
                  </p>
                )}
              </div>
              <button onClick={() => setShowRolloverBanner(false)} className="text-blue-400 hover:text-blue-600 text-xs shrink-0">✕</button>
            </div>
          </div>
        )}

        {/* Platform Maintenance Banner */}
        {platformMaintenance && (
          <div className="shrink-0 mb-3 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4">
            <WifiOff size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">AI Temporarily Unavailable</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                The AI assistant is temporarily unavailable due to maintenance, upgrades, or a temporary service issue.
                We&apos;re actively working to restore access as quickly as possible. Please try again shortly.
              </p>
              <button onClick={() => setPlatformMaintenance(false)} className="mt-2 text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
          {initializing ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-green-400" />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        {messages.length <= 1 && !loading && (
          <div className="shrink-0 mb-3">
            <p className="text-xs text-gray-400 mb-2 font-medium">Quick questions:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  disabled={!isActive && !p.includes('general')}
                  className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-xl border border-green-100 hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Box */}
        <div className="shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex items-end gap-2 p-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 resize-none outline-none px-3 py-2.5 max-h-32 overflow-y-auto bg-transparent"
            placeholder={
              platformMaintenance
                ? "AI is temporarily unavailable — please try again shortly"
                : isActive
                ? "Ask your AI agent anything…"
                : "Subscribe to unlock full AI access"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || platformMaintenance}
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || platformMaintenance}
            className="w-10 h-10 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        {!isActive && (
          <p className="text-xs text-center text-amber-600 mt-2">
            ⚠ Limited mode — <a href="/billing" className="underline font-semibold">reactivate your subscription</a> for full AI access
          </p>
        )}
      </div>
    </PortalLayout>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const content = message.content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? 'bg-gray-100' : 'bg-green-600'
      }`}>
        {isUser ? <User size={16} className="text-gray-500" /> : <Bot size={16} className="text-white" />}
      </div>
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-green-600 text-white rounded-tr-sm'
              : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
          }`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
        {message.timestamp && (
          <p className={`text-[10px] text-gray-300 ${isUser ? 'text-right' : ''}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
