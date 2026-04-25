'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import ChatBotPanel from './ChatBotPanel'

export default function HomepageChatbot() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 btn-primary rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center"
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <ChatBotPanel onClose={() => setIsOpen(false)} />
      )}
    </>
  )
}
