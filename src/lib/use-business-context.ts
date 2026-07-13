'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccessibleBusiness, UserProfile } from '@/types'

type BusinessContextProfile = UserProfile & {
  effective_allowed_programs?: string[] | null
}

interface BusinessContextResponse {
  active_business_id: string
  active_profile: BusinessContextProfile
  active_role: 'owner' | 'admin' | 'member' | 'delegate'
  businesses: AccessibleBusiness[]
  has_multiple_businesses: boolean
}

const BUSINESS_CONTEXT_CACHE_KEY = 'sl-business-context-cache'
const BUSINESS_CONTEXT_CACHE_TTL_MS = 30_000

let cachedContext: BusinessContextResponse | null = null
let cachedAt = 0
let inflightRefresh: Promise<BusinessContextResponse | null> | null = null

function readCachedContextFromStorage() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(BUSINESS_CONTEXT_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as { cachedAt?: number; context?: BusinessContextResponse | null }
    if (!parsed?.context || !parsed?.cachedAt) return null
    if (Date.now() - parsed.cachedAt > BUSINESS_CONTEXT_CACHE_TTL_MS) return null

    cachedContext = parsed.context
    cachedAt = parsed.cachedAt
    return parsed.context
  } catch {
    return null
  }
}

function persistCachedContext(context: BusinessContextResponse | null) {
  if (typeof window === 'undefined' || !context) return

  cachedContext = context
  cachedAt = Date.now()
  window.sessionStorage.setItem(BUSINESS_CONTEXT_CACHE_KEY, JSON.stringify({
    cachedAt,
    context,
  }))
}

function getCachedContext() {
  if (cachedContext && Date.now() - cachedAt <= BUSINESS_CONTEXT_CACHE_TTL_MS) {
    return cachedContext
  }

  return readCachedContextFromStorage()
}

export function useBusinessContext() {
  const [context, setContext] = useState<BusinessContextResponse | null>(() => getCachedContext())
  const [loading, setLoading] = useState(() => !getCachedContext())

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false
    const existing = getCachedContext()
    if (existing) {
      setContext(existing)
      setLoading(false)
    }

    if (inflightRefresh) {
      setLoading(!existing && force)
      return inflightRefresh
    }

    if (!existing) {
      setLoading(true)
    }

    inflightRefresh = (async () => {
      try {
        const res = await fetch('/api/portal/business-context', { cache: 'no-store' })
        if (!res.ok) {
          setContext(null)
          return null
        }
        const data = await res.json()
        persistCachedContext(data as BusinessContextResponse)
        setContext(data)
        return data as BusinessContextResponse
      } finally {
        inflightRefresh = null
        setLoading(false)
      }
    })()

    return inflightRefresh
  }, [])

  useEffect(() => {
    const existing = getCachedContext()
    if (existing) {
      setContext(existing)
      setLoading(false)
      void refresh({ force: true })
      return
    }

    void refresh({ force: true })
  }, [refresh])

  const activePrograms = useMemo(
    () => (context?.active_profile?.effective_allowed_programs ?? []).filter(Boolean),
    [context?.active_profile?.effective_allowed_programs]
  )

  const businesses = useMemo(
    () => context?.businesses ?? [],
    [context?.businesses]
  )

  return {
    context,
    loading,
    refresh,
    activeBusinessId: context?.active_business_id ?? null,
    activeProfile: context?.active_profile ?? null,
    activePrograms,
    businesses,
    hasMultipleBusinesses: context?.has_multiple_businesses ?? false,
  }
}
