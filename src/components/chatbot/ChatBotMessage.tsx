import { ReactNode } from 'react'

interface ChatBotMessageProps {
  role: 'user' | 'bot'
  content: string | ReactNode
}

export default function ChatBotMessage({ role, content }: ChatBotMessageProps) {
  const isUser = role === 'user'

  return (
    <div
      className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-xs px-4 py-3 rounded-lg text-sm ${
          isUser
            ? 'bg-green-600 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none dark:bg-gray-700 dark:text-gray-100'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
