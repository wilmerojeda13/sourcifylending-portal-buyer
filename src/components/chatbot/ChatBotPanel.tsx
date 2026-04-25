'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader } from 'lucide-react'
import ChatBotMessage from './ChatBotMessage'
import QualificationResult from './QualificationResult'
import { getStep, getNextStep, getStepIndex, getTotalSteps, type ChatbotStep } from '@/lib/chatbot-flow'
import { runQualification, hasEnoughDataToQualify } from '@/lib/chatbot-service'
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
  const [currentStep, setCurrentStep] = useState<ChatbotStep>('intro')
  const [validationError, setValidationError] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isSubmittingRef = useRef(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize with intro step
  useEffect(() => {
    const introStep = getStep('intro')
    if (introStep) {
      const greeting: ChatMessage = {
        role: 'bot',
        content: introStep.botMessage,
      }
      setMessages([greeting])
    }

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
    if (!input.trim() || isSubmittingRef.current) return

    isSubmittingRef.current = true
    setValidationError('')
    const userInput = input.trim()

    // Get current step config
    const currentStepConfig = getStep(currentStep)
    if (!currentStepConfig) {
      isSubmittingRef.current = false
      return
    }

    // If this step has validation, validate the input
    if (currentStepConfig.validate) {
      const validationResult = currentStepConfig.validate(userInput)
      if (!validationResult.valid) {
        setValidationError(validationResult.error || 'Invalid input')
        isSubmittingRef.current = false
        return
      }

      // Extract the validated value
      const fieldValue = validationResult.value !== undefined ? validationResult.value : userInput

      // Update collected data with the field value
      if (currentStepConfig.field) {
        const field = currentStepConfig.field
        setCollectedData((prev) => ({
          ...prev,
          [field]: fieldValue,
        }))
      }

      // Add user message to chat
      setMessages((prev) => [...prev, { role: 'user', content: userInput }])
      setInput('')

      // Determine next step
      const nextStep = getNextStep(currentStep)

      // Check if we've reached qualification
      if (nextStep === 'qualification') {
        // We have all required data - run qualification
        const field = currentStepConfig.field
        const updatedData = {
          ...collectedData,
          ...(field ? { [field]: fieldValue } : {}),
        }
        const result = runQualification(updatedData)
        setQualificationResult(result)
        setCollectedData(updatedData)

        // Track completion
        try {
          fetch('/api/chatbot/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'qualification_completed' }),
          }).catch(() => {})
        } catch {
          // Ignore
        }

        setCurrentStep('qualification')
        isSubmittingRef.current = false
        return
      }

      // Move to next step
      const nextStepConfig = getStep(nextStep)
      if (nextStepConfig) {
        setCurrentStep(nextStep)
        setMessages((prev) => [
          ...prev,
          { role: 'bot', content: nextStepConfig.botMessage },
        ])
      }

      // Track first message sent (only once, on first real message)
      if (messages.length <= 1 && currentStep === 'intro') {
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
    }

    isSubmittingRef.current = false
  }

  const handleQuickReply = (value: string) => {
    if (isSubmittingRef.current) return

    // Set input for UX feedback
    setInput(value)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    isSubmittingRef.current = true
    setValidationError('')

    const currentStepConfig = getStep(currentStep)
    if (!currentStepConfig || !currentStepConfig.validate) {
      isSubmittingRef.current = false
      return
    }

    const validationResult = currentStepConfig.validate(value)
    if (!validationResult.valid) {
      setValidationError(validationResult.error || 'Invalid selection')
      isSubmittingRef.current = false
      return
    }

    const fieldValue = validationResult.value !== undefined ? validationResult.value : value

    // Update collected data
    if (currentStepConfig.field) {
      const field = currentStepConfig.field
      setCollectedData((prev) => ({
        ...prev,
        [field]: fieldValue,
      }))
    }

    // Add to messages
    setMessages((prev) => [...prev, { role: 'user', content: value }])
    setInput('')

    // Get next step
    const nextStep = getNextStep(currentStep)

    if (nextStep === 'qualification') {
      // Run qualification
      const field = currentStepConfig.field
      const updatedData = {
        ...collectedData,
        ...(field ? { [field]: fieldValue } : {}),
      }
      const result = runQualification(updatedData)
      setQualificationResult(result)
      setCollectedData(updatedData)

      try {
        fetch('/api/chatbot/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'qualification_completed' }),
        }).catch(() => {})
      } catch {
        // Ignore
      }

      setCurrentStep('qualification')
      isSubmittingRef.current = false
      return
    }

    const nextStepConfig = getStep(nextStep)
    if (nextStepConfig) {
      setCurrentStep(nextStep)
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: nextStepConfig.botMessage },
      ])
    }

    isSubmittingRef.current = false
  }

  const currentStepConfig = getStep(currentStep)
  const stepNumber = currentStep === 'qualification' ? getTotalSteps() : getStepIndex(currentStep)
  const totalSteps = getTotalSteps()

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
            {currentStep !== 'qualification' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Step {stepNumber} of {totalSteps}
              </p>
            )}
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
      {!qualificationResult && currentStepConfig?.quickReplies && (
        <div className="px-4 pb-3 space-y-2">
          {currentStepConfig.quickReplies.map((reply) => (
            <button
              key={reply.value}
              onClick={() => handleQuickReply(reply.value)}
              disabled={isSubmittingRef.current}
              className="btn-secondary text-xs py-2 px-3 text-left w-full disabled:opacity-50"
            >
              {reply.label}
            </button>
          ))}
        </div>
      )}

      {/* Validation Error */}
      {validationError && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-600 dark:text-red-400">{validationError}</p>
        </div>
      )}

      {/* Input */}
      {!qualificationResult && currentStepConfig && (
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
              disabled={isSubmittingRef.current}
              autoFocus
            />
            <button
              onClick={handleSendMessage}
              disabled={isSubmittingRef.current || !input.trim()}
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
