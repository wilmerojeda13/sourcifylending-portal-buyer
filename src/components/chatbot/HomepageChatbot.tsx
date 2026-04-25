'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import ChatBotPanel from './ChatBotPanel'

const INTERNAL_ROUTES = [
  '/login',
  '/signin',
  '/sign-in',
  '/signup',
  '/register',
  '/portal',
  '/admin',
  '/crm',
  '/dialer',
  '/client',
  '/dashboard',
  '/auth',
  '/underwriting',
]

export default function HomepageChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [shouldShow, setShouldShow] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const isInternalRoute = INTERNAL_ROUTES.some((route) =>
      pathname.startsWith(route)
    )
    setShouldShow(!isInternalRoute)
  }, [pathname])

  if (!shouldShow) return null

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
