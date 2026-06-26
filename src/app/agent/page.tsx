'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PortalLayout from '@/components/layout/PortalLayout'
import { Send, Bot, User, RefreshCw, Loader2, WifiOff, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel } from '@/lib/utils'
import type { ChatMessage, UserProfile } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { useBusinessContext } from '@/lib/use-business-context'
import { canAccessFeature } from '@/lib/feature-entitlements'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

export default function AgentPageWrapper() {
  return (
    <Suspense fallback={<PortalLayout><div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-green-400" /></div></PortalLayout>}>
      <AgentPage />
    </Suspense>
  )
}

function AgentPage() {
  const supabase = createClient()
  const { activeBusinessId } = useBusinessContext()
  const searchParams = useSearchParams()
  const { locale } = useLanguage()
  const text = useCallback((key: string, fallback: string) => t(locale, key, fallback), [locale])
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [priorSummary, setPriorSummary] = useState<string | null>(null)
  const [showRolloverBanner, setShowRolloverBanner] = useState(false)

  const quickPrompts = [
    text('agent.quickPrompt1', "I'm lost - what do I do next?"),
    text('agent.quickPrompt2', 'What documents are still missing?'),
    text('agent.quickPrompt3', 'Am I ready yet?'),
    text('agent.quickPrompt4', 'What tradelines do I still need?'),
    text('agent.quickPrompt5', 'Explain my current stage'),
    text('agent.quickPrompt6', 'Generate a progress summary'),
  ]

  const interpolate = useCallback((template: string, values: Record<string, string>) => {
    return Object.entries(values).reduce(
      (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
      template
    )
  }, [])

  const buildGreeting = useCallback((userProfile: UserProfile | null, nextTask?: { title?: string | null; stage?: string | null } | null) => {
    const firstName = (userProfile?.full_name || 'there').split(' ')[0]
    const programLabel = getProgramShortLabel(userProfile?.assigned_program ?? null)

    if (userProfile?.billing_status === 'active' || userProfile?.billing_status === 'trialing') {
      if (nextTask?.title) {
        return interpolate(
          text(
            'agent.greetingWithTask',
            'Hi {{name}}! I am your AI Fulfillment Agent for the {{program}} program. Your next task is "{{task}}" ({{stage}}). Want me to walk you through it step by step? Just say "yes" or ask me anything about your program.'
          ),
          {
            name: firstName,
            program: programLabel,
            task: nextTask.title,
            stage: nextTask.stage || text('progress.stageLabel', 'Stage'),
          }
        )
      }

      return interpolate(
        text(
          'agent.greetingGeneral',
          'Hi {{name}}! I am your AI Fulfillment Agent for the {{program}} program. I have full visibility into your tasks, documents, and progress. Ask me anything, or tap one of the quick prompts below to get started.'
        ),
        {
          name: firstName,
          program: programLabel,
        }
      )
    }

    return text(
      'agent.greetingInactive',
      'Hi there! Your subscription is currently inactive, so my capabilities are limited. Please reactivate your subscription to access full AI fulfillment guidance. I can still answer general questions about your program.'
    )
  }, [interpolate, text])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    const init = async () => {
      if (!activeBusinessId) return

      const [{ data: profileData }, convRes, { data: nextTaskData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', activeBusinessId).single(),
        fetch('/api/agent/conversation'),
        supabase
          .from('tasks')
          .select('title, stage')
          .eq('user_id', activeBusinessId)
          .eq('status', 'pending')
          .order('sort_order')
          .limit(1)
          .maybeSingle(),
      ])

      setProfile(profileData)
      setIsActive(profileData?.billing_status === 'active' || profileData?.billing_status === 'trialing')

      const convData = convRes.ok ? await convRes.json() : null
      setConversationId(convData?.conversation_id ?? null)

      if (convData?.was_rolled_over) {
        setPriorSummary(convData.prior_summary ?? null)
        setShowRolloverBanner(true)
      }

      const priorMessages: ChatMessage[] = (convData?.messages ?? []).map((message: {
        id: string
        role: string
        content: string
        created_at: string
      }) => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content: message.content,
        timestamp: message.created_at,
      }))

      if (priorMessages.length === 0) {
        setMessages([
          {
            id: uuidv4(),
            role: 'assistant',
            content: buildGreeting(profileData, nextTaskData),
            timestamp: new Date().toISOString(),
          },
        ])
      } else {
        setMessages(priorMessages)
      }

      setInitializing(false)
    }

    init()
  }, [activeBusinessId, buildGreeting, supabase])

  const persistMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!conversationId) return

    fetch('/api/agent/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, role, content }),
    }).catch(() => {})
  }, [conversationId])

  const sendMessage = useCallback(async (rawText: string) => {
    if (!rawText.trim() || loading) return

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: rawText.trim(),
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
          messages: [...messages, userMsg].map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const data = await res.json()

      if (data.platform_maintenance) {
        setPlatformMaintenance(true)
        setLoading(false)
        return
      }

      const aiContent = data.message || text('agent.errorMessage', 'I encountered an error. Please try again.')
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: aiContent,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMsg])
      persistMessage('assistant', aiContent)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          content: text('agent.retryMessage', 'Sorry, something went wrong. Please try again in a moment.'),
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, persistMessage, text])

  const autoPromptSentRef = useRef(false)
  useEffect(() => {
    if (!autoPrompt || initializing || autoPromptSentRef.current) return
    autoPromptSentRef.current = true
    void sendMessage(autoPrompt)
  }, [autoPrompt, initializing, sendMessage])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(input)
    }
  }

  const clearChat = () => {
    setMessages([
      {
        id: uuidv4(),
        role: 'assistant',
        content: text(
          'agent.chatCleared',
          'Chat cleared. I still have your full profile and progress context. What would you like to work on?'
        ),
        timestamp: new Date().toISOString(),
      },
    ])
  }

  const hasHistory = messages.length > 1
  const canAccessAgent = canAccessFeature(profile?.feature_tier, profile?.billing_status, 'ai_agent')

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program as string | null)}
      assignedProgram={profile?.assigned_program as string | null}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      planTier={profile?.feature_tier}
      subscriptionStatus={profile?.billing_status}
    >
      {!canAccessAgent && !initializing && (
        <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-6 px-4">
          <div className="max-w-md text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Bot size={32} className="text-green-600" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              {text('agent.upgradeRequired', 'AI Agent Upgrade Required')}
            </h1>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              {text('agent.upgradeDescription', 'The AI Fulfillment Agent is available on our paid plans. Upgrade to access AI-powered guidance for your credit journey.')}
            </p>
            <div className="flex flex-col gap-3">
              <a
                href="/billing"
                className="inline-flex items-center justify-center rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-700"
              >
                {text('agent.viewPlans', 'View Paid Plans')}
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-6 py-3 font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
              >
                {text('agent.backDashboard', 'Back to Dashboard')}
              </a>
            </div>
          </div>
        </div>
      )}

      {canAccessAgent && (
        <div className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-4rem)]">
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <div>
              <h1 className="page-title flex items-center gap-2">
                <Bot size={24} className="text-green-500" /> {text('agent.title', 'AI Fulfillment Agent')}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                {profile?.assigned_program ? getProgramShortLabel(profile.assigned_program) : text('agent.subtitle', 'AI-powered guidance for your credit journey')}
                {hasHistory && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                    <History size={10} /> {text('agent.saved', 'Saved')}
                  </span>
                )}
              </p>
            </div>
            <button onClick={clearChat} className="btn-secondary px-3 py-2 text-xs">
              <RefreshCw size={14} /> {text('agent.clear', 'Clear')}
            </button>
          </div>

          {showRolloverBanner && (
            <div className="mb-3 shrink-0 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900 dark:text-blue-300">
                    <History size={14} /> {text('agent.continuing', 'Continuing where you left off')}
                  </p>
                  {priorSummary ? (
                    <p className="mt-1 text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                      <strong>{text('agent.priorSummary', 'Prior session summary:')}</strong> {priorSummary}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                      {text('agent.archivedContext', 'Your previous conversation was archived to keep things organized. Your progress and context are fully preserved.')}
                    </p>
                  )}
                </div>
                <button onClick={() => setShowRolloverBanner(false)} className="shrink-0 text-xs text-blue-400 hover:text-blue-600">
                  x
                </button>
              </div>
            </div>
          )}

          {platformMaintenance && (
            <div className="mb-3 flex shrink-0 items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-900/30">
              <WifiOff size={20} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {text('agent.maintenanceTitle', 'AI Temporarily Unavailable')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  {text('agent.maintenanceBody', 'The AI assistant is temporarily unavailable due to maintenance, upgrades, or a temporary service issue. We are actively working to restore access as quickly as possible. Please try again shortly.')}
                </p>
                <button
                  onClick={() => setPlatformMaintenance(false)}
                  className="mt-2 text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  {text('agent.dismiss', 'Dismiss')}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto pb-2 pr-1">
            {initializing ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 size={24} className="animate-spin text-green-400" />
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} locale={locale} />
                ))}
                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600">
                      <Bot size={16} className="text-white" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex h-4 items-center gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-green-400 [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-green-400 [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-green-400" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && !loading && (
            <div className="mb-3 shrink-0">
              <p className="mb-2 text-xs font-medium text-gray-400">
                {text('agent.quickQuestions', 'Quick questions:')}
              </p>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <textarea
              ref={inputRef}
              rows={1}
              className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
              placeholder={
                platformMaintenance
                  ? text('agent.placeholderMaintenance', 'AI is temporarily unavailable - please try again shortly')
                  : isActive
                    ? text('agent.placeholderActive', 'Ask your AI agent anything...')
                    : text('agent.placeholderInactive', 'Subscribe to unlock full AI access')
              }
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || platformMaintenance}
              style={{ minHeight: '44px' }}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || loading || platformMaintenance}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>

          {!isActive && (
            <p className="mt-2 text-center text-xs text-amber-600">
              {text('agent.limitedMode', 'Limited mode - reactivate your subscription for full AI access')}{' '}
              <a href="/billing" className="font-semibold underline">
                {text('dashboard.reactivate', 'Reactivate')}
              </a>
            </p>
          )}
        </div>
      )}
    </PortalLayout>
  )
}

function MessageBubble({ message, locale }: { message: ChatMessage; locale: 'en' | 'es' }) {
  const isUser = message.role === 'user'
  const content = message.content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        isUser ? 'bg-gray-100 dark:bg-gray-700' : 'bg-green-600'
      }`}>
        {isUser ? <User size={16} className="text-gray-500" /> : <Bot size={16} className="text-white" />}
      </div>
      <div className="flex max-w-[80%] flex-col gap-1">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'rounded-tr-sm bg-green-600 text-white'
              : 'rounded-tl-sm border border-gray-100 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
        {message.timestamp && (
          <p className={`text-[10px] text-gray-300 ${isUser ? 'text-right' : ''}`}>
            {new Date(message.timestamp).toLocaleTimeString(locale === 'es' ? 'es-ES' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  )
}
