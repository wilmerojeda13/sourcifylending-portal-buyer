'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X } from 'lucide-react'
import ChatBotMessage from './ChatBotMessage'
import QualificationResult from './QualificationResult'
import { getStep, getNextStep, getProgressPercent, type ChatbotStep } from '@/lib/chatbot-flow-simple'
import { calculateChatbotScore } from '@/lib/chatbot-scoring'
import type { QualificationResult as QualResult } from '@/types'

interface ChatMessage {
  role: 'user' | 'bot'
  content: string
}

interface ChatBotPanelProps {
  onClose: () => void
}

export default function ChatBotPanel({ onClose }: ChatBotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [currentStep, setCurrentStep] = useState<ChatbotStep>('welcome')
  const [collectedData, setCollectedData] = useState<Record<string, string>>({})
  const [isBotTyping, setIsBotTyping] = useState(false)
  const [result, setResult] = useState<QualResult | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize with welcome
  useEffect(() => {
    const welcomeStep = getStep('welcome')
    if (welcomeStep) {
      setMessages([{ role: 'bot', content: welcomeStep.botMessage }])
    }

    try {
      fetch('/api/chatbot/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'chatbot_opened' }),
      }).catch(() => {})
    } catch {}
  }, [])

  const handleQuickReply = (value: string) => {
    setIsBotTyping(true)

    // Handle special actions
    if (value === 'pricing') {
      setCurrentStep('pricing')
      setTimeout(() => {
        const step = getStep('pricing')
        if (step) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: 'See pricing' },
            { role: 'bot', content: step.botMessage },
          ])
        }
        setIsBotTyping(false)
      }, 500)
      return
    }

    if (value === 'how_it_works') {
      setCurrentStep('how_it_works')
      setTimeout(() => {
        const step = getStep('how_it_works')
        if (step) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: 'How it works' },
            { role: 'bot', content: step.botMessage },
          ])
        }
        setIsBotTyping(false)
      }, 500)
      return
    }

    if (value === 'start_check') {
      setCurrentStep('name')
      setTimeout(() => {
        const step = getStep('name')
        if (step) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: 'Check my options' },
            { role: 'bot', content: step.botMessage },
          ])
        }
        setIsBotTyping(false)
      }, 500)
      return
    }

    if (value === 'go_analyzer' || value === 'open_analyzer') {
      window.open('/analyzer', '_blank')
      setIsBotTyping(false)
      return
    }

    // Regular quick reply - save and advance
    const stepConfig = getStep(currentStep)
    if (!stepConfig?.field) {
      setIsBotTyping(false)
      return
    }

    setCollectedData((prev) => ({
      ...prev,
      [stepConfig.field!]: value,
    }))

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: value },
    ])

    // Show typing indicator
    setTimeout(() => {
      const nextStep = getNextStep(currentStep)
      if (nextStep === 'complete') {
        // Run scoring
        const scored = calculateChatbotScore({
          full_name: collectedData.full_name,
          email: collectedData.email,
          phone: collectedData.phone,
          business_name: collectedData.business_name,
          business_age: collectedData.business_age,
          monthly_revenue: value,
          credit_score_range: collectedData.credit_score_range,
          funding_goal: collectedData.funding_goal,
          industry: collectedData.industry,
        })
        setResult(scored)
        setMessages((prev) => [
          ...prev,
          { role: 'bot', content: 'Thanks. I\'ll summarize your funding readiness now.' },
        ])
        setCurrentStep('result')

        // Save lead
        saveLeadToCRM({
          ...collectedData,
          [stepConfig.field!]: value,
        }, scored)
      } else {
        setCurrentStep(nextStep as ChatbotStep)
        const nextStepConfig = getStep(nextStep as ChatbotStep)
        if (nextStepConfig) {
          setMessages((prev) => [
            ...prev,
            { role: 'bot', content: nextStepConfig.botMessage },
          ])
        }
      }
      setIsBotTyping(false)
    }, 500)
  }

  const handleSendMessage = () => {
    if (!input.trim() || isBotTyping) return

    const stepConfig = getStep(currentStep)
    if (!stepConfig?.field) return

    // Handle combined contact field
    if (stepConfig.field === 'contact') {
      const emailMatch = input.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i)
      const phoneMatch = input.match(/\d{10,}/)

      if (!emailMatch && !phoneMatch) {
        alert('Please provide at least an email or phone number.')
        return
      }

      const newData: Record<string, string> = { ...collectedData }
      if (emailMatch) newData.email = emailMatch[1]
      if (phoneMatch) newData.phone = phoneMatch[0].slice(-10)

      setCollectedData(newData)
      setMessages((prev) => [...prev, { role: 'user', content: input }])
      setInput('')
      setIsBotTyping(true)

      setTimeout(() => {
        const nextStep = getNextStep(currentStep)
        if (nextStep === 'complete') {
          const scored = calculateChatbotScore({ ...newData })
          setResult(scored)
          setMessages((prev) => [
            ...prev,
            { role: 'bot', content: 'Thanks. I\'ll summarize your funding readiness now.' },
          ])
          setCurrentStep('result')
          saveLeadToCRM(newData, scored)
        } else {
          setCurrentStep(nextStep as ChatbotStep)
          const nextStepConfig = getStep(nextStep as ChatbotStep)
          if (nextStepConfig) {
            setMessages((prev) => [
              ...prev,
              { role: 'bot', content: nextStepConfig.botMessage },
            ])
          }
        }
        setIsBotTyping(false)
      }, 500)
      return
    }

    // Regular text field
    if (stepConfig.field === 'full_name' && input.trim().length < 2) {
      alert('Please enter at least 2 characters.')
      return
    }

    const newData = {
      ...collectedData,
      [stepConfig.field]: input.trim(),
    }

    setCollectedData(newData)
    setMessages((prev) => [...prev, { role: 'user', content: input }])
    setInput('')
    setIsBotTyping(true)

    setTimeout(() => {
      const nextStep = getNextStep(currentStep)
      if (nextStep === 'complete') {
        const scored = calculateChatbotScore({ full_name: newData.full_name } as any)
        setResult(scored)
        setMessages((prev) => [
          ...prev,
          { role: 'bot', content: 'Thanks. I\'ll summarize your funding readiness now.' },
        ])
        setCurrentStep('result')
        saveLeadToCRM(newData, scored)
      } else {
        setCurrentStep(nextStep as ChatbotStep)
        const nextStepConfig = getStep(nextStep as ChatbotStep)
        if (nextStepConfig) {
          setMessages((prev) => [
            ...prev,
            { role: 'bot', content: nextStepConfig.botMessage },
          ])
        }
      }
      setIsBotTyping(false)
    }, 500)
  }

  async function saveLeadToCRM(data: Record<string, string>, scored: QualResult) {
    try {
      fetch('/api/chatbot/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name || '',
          email: data.email || '',
          phone: data.phone || '',
          business_name: data.business_name || '',
          business_age: data.business_age,
          monthly_revenue: data.monthly_revenue,
          credit_score_range: data.credit_score_range,
          funding_goal: data.funding_goal,
          industry: data.industry,
          qualificationResult: scored,
        }),
      }).catch(() => {})
    } catch {}
  }

  const stepConfig = getStep(currentStep)
  const progress = getProgressPercent(currentStep)

  return (
    <div className="fixed bottom-0 right-0 z-40 sm:bottom-6 sm:right-6 w-full sm:w-96 max-h-screen sm:max-h-[600px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">SL</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              SourcifyLending Assistant
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Funding readiness check
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          aria-label="Close chat"
        >
          <X size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Progress bar */}
      {!result && currentStep !== 'welcome' && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <ChatBotMessage
            key={idx}
            role={msg.role}
            content={msg.content}
          />
        ))}

        {isBotTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg rounded-bl-none px-4 py-3 flex gap-1">
              <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <QualificationResult
              result={result}
              collectedData={collectedData}
              onClose={onClose}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {!result && stepConfig?.quickReplies && (
        <div className="px-4 pb-3 space-y-2">
          {stepConfig.quickReplies.map((reply) => (
            <button
              key={reply.value}
              onClick={() => handleQuickReply(reply.value)}
              disabled={isBotTyping}
              className="btn-secondary text-xs py-2 px-3 text-left w-full disabled:opacity-50"
            >
              {reply.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {!result && stepConfig?.inputType && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Your answer..."
              className="input-field flex-1 py-2"
              disabled={isBotTyping}
              autoFocus
            />
            <button
              onClick={handleSendMessage}
              disabled={isBotTyping || !input.trim()}
              className="btn-primary p-2 flex-shrink-0 disabled:opacity-50"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
