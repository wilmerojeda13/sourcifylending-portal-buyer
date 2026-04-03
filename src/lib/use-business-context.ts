'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccessibleBusiness, UserProfile } from '@/types'

interface BusinessContextResponse {
  active_business_id: string
  active_profile: UserProfile
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

  return {
    context,
    loading,
    refresh,
    activeBusinessId: context?.active_business_id ?? null,
    activeProfile: context?.active_profile ?? null,
    businesses: context?.businesses ?? [],
    hasMultipleBusinesses: context?.has_multiple_businesses ?? false,
  }
}
