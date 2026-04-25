'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader } from 'lucide-react'
import ChatBotMessage from './ChatBotMessage'
import QuickReplies from './QuickReplies'
import QualificationResult from './QualificationResult'
import { getChatbotResponse, extractLeadData } from '@/lib/chatbot-service'
import type { CollectedData, QualificationResult as QualResult } from '@/types'

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
  const [isLoading, setIsLoading] = useState(false)
  const [collectedData, setCollectedData] = useState<Partial<CollectedData>>({})
  const [qualificationResult, setQualificationResult] = useState<QualResult | null>(null)
  const [showQuickReplies, setShowQuickReplies] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize with greeting and track event
  useEffect(() => {
    const greeting: ChatMessage = {
      role: 'bot',
      content:
        'Hi! 👋 I can help you understand your funding options and see if SourcifyLending may be a fit. Want to check your options?',
    }
    setMessages([greeting])

    // Track chatbot opened
    try {
      fetch('/api/chatbot/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'chatbot_opened' }),
      }).catch(() => {})
    } catch {
      // Ignore analytics errors
    }
  }, [])

  const handleSendMessage = async () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setShowQuickReplies(false)

    // Track first message sent
    if (messages.length <= 1) {
      try {
        fetch('/api/chatbot/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'first_message_sent' }),
        }).catch(() => {})
      } catch {
        // Ignore
      }
    }

    try {
      // Extract any lead data from the user message
      const extracted = extractLeadData(input, collectedData)
      setCollectedData((prev) => ({ ...prev, ...extracted }))

      // Get bot response (with fallback)
      const response = await getChatbotResponse(
        input,
        { ...collectedData, ...extracted },
        messages
      )

      const botMessage: ChatMessage = {
        role: 'bot',
        content: response.message || 'Thanks for that information. Can you tell me a bit more about your business?',
      }

      setMessages((prev) => [...prev, botMessage])

      // Check if qualification is complete
      if (response.isComplete && response.qualificationResult) {
        setQualificationResult(response.qualificationResult)
      }
    } catch (error) {
      console.error('Error getting chatbot response:', error)
      const errorMessage: ChatMessage = {
        role: 'bot',
        content:
          'I had trouble processing that. Can you tell me your business name?',
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickReply = (value: string) => {
    setInput(value)
    setTimeout(() => {
      inputRef.current?.focus()
      // Send the message after setting input
      const extracted = extractLeadData(value, collectedData)
      const updatedData = { ...collectedData, ...extracted }
      setCollectedData(updatedData)

      const userMessage: ChatMessage = {
        role: 'user',
        content: value,
      }
      setMessages((prev) => [...prev, userMessage])
      setShowQuickReplies(false)

      // Get bot response
      setIsLoading(true)
      getChatbotResponse(value, updatedData, [...messages, userMessage])
        .then((response) => {
          const botMessage: ChatMessage = {
            role: 'bot',
            content: response.message || 'Thanks for that information. Can you tell me a bit more about your business?',
          }
          setMessages((prev) => [...prev, botMessage])

          if (response.isComplete && response.qualificationResult) {
            setQualificationResult(response.qualificationResult)
          }
        })
        .catch((error) => {
          console.error('Error getting chatbot response:', error)
          const errorMessage: ChatMessage = {
            role: 'bot',
            content: 'I had trouble processing that. Can you tell me your business name?',
          }
          setMessages((prev) => [...prev, errorMessage])
        })
        .finally(() => {
          setIsLoading(false)
        })
    }, 0)
  }

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
              SourcifyLending
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              AI Assistant
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <ChatBotMessage
            key={idx}
            role={msg.role}
            content={msg.content}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg rounded-bl-none px-4 py-3">
              <Loader size={16} className="animate-spin text-gray-600" />
            </div>
          </div>
        )}

        {/* Qualification Result */}
        {qualificationResult && (
          <div className="mt-4">
            <QualificationResult
              result={qualificationResult}
              collectedData={collectedData}
              onClose={onClose}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && messages.length === 1 && !qualificationResult && (
        <div className="px-4 pb-3 space-y-2">
          <button
            onClick={() => handleQuickReply("I'd like to check if I qualify for funding")}
            className="btn-secondary text-xs py-2 px-3 text-left w-full"
          >
            ✓ Check if I qualify
          </button>
          <a
            href="/pricing"
            className="block btn-secondary text-xs py-2 px-3 text-left text-center"
          >
            💰 See pricing
          </a>
          <a
            href="/#how-it-works"
            className="block btn-secondary text-xs py-2 px-3 text-left text-center"
          >
            ❓ How does it work?
          </a>
        </div>
      )}

      {/* Input */}
      {!qualificationResult && (
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
              placeholder="Type your answer..."
              className="input-field flex-1 py-2"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
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
