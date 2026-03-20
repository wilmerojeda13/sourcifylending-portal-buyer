'use client'

import { useCallback } from 'react'

interface TrackEventParams {
  action_type: string
  program?: string
  stage?: string
  opportunity_id?: string
  result?: string
  metadata?: Record<string, unknown>
}

export function useTrackEvent() {
  const track = useCallback(async (params: TrackEventParams) => {
    try {
      await fetch('/api/events/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch {
      // Never block UI for analytics
    }
  }, [])

  return { track }
}
