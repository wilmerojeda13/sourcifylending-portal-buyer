'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Sparkles } from 'lucide-react'

type PortalAIFloatingWidgetProps = {
  assignedProgram?: string | null
  accountState?: 'prospect' | 'active_member'
  userName?: string
}

const GlobalAIPanel = dynamic(() => import('@/components/ai/GlobalAIPanel'), { ssr: false })

export default function PortalAIFloatingWidget({ assignedProgram, accountState, userName }: PortalAIFloatingWidgetProps) {
  const [mounted, setMounted] = useState(false)

  return (
    <>
      {!mounted && (
        <button
          onClick={() => setMounted(true)}
          className="hidden lg:flex fixed z-50 items-center gap-2 px-4 py-3 rounded-full shadow-lg bg-gray-900 hover:bg-gray-800 text-white transition-all duration-200 hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
        >
          <Sparkles size={16} className="text-green-400" />
          <span className="text-sm font-semibold">AI</span>
        </button>
      )}

      {mounted && (
        <GlobalAIPanel
          assignedProgram={assignedProgram}
          accountState={accountState}
          userName={userName}
          defaultOpen
        />
      )}
    </>
  )
}
