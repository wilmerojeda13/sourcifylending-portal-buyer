'use client'

import { useEffect, useMemo, useState } from 'react'
import WelcomeGate from './WelcomeGate'

interface Props {
  show: boolean
  programLabel: string
  userName: string
  agreementKey?: string | null
}

export default function WelcomeGateWrapper({ show, programLabel, userName, agreementKey }: Props) {
  const [visible, setVisible] = useState(show)
  const storageKey = useMemo(() => {
    if (!agreementKey) return null
    return `sl_welcome_gate_completed:${agreementKey}`
  }, [agreementKey])

  useEffect(() => {
    setVisible(show)
  }, [show])

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    if (window.localStorage.getItem(storageKey) === '1') {
      setVisible(false)
    }
  }, [storageKey])

  if (!visible) return null

  return (
    <WelcomeGate
      programLabel={programLabel}
      userName={userName}
      onComplete={() => {
        if (storageKey && typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, '1')
        }
        setVisible(false)
      }}
    />
  )
}
