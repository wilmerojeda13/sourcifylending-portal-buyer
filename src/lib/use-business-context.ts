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

export function useBusinessContext() {
  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/business-context', { cache: 'no-store' })
      if (!res.ok) {
        setContext(null)
        return null
      }
      const data = await res.json()
      setContext(data)
      return data as BusinessContextResponse
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
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
