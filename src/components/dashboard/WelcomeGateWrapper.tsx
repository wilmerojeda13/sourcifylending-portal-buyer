'use client'

import { useState } from 'react'
import WelcomeGate from './WelcomeGate'

interface Props {
  show: boolean
  programLabel: string
  userName: string
}

export default function WelcomeGateWrapper({ show, programLabel, userName }: Props) {
  const [visible, setVisible] = useState(show)

  if (!visible) return null

  return (
    <WelcomeGate
      programLabel={programLabel}
      userName={userName}
      onComplete={() => setVisible(false)}
    />
  )
}
