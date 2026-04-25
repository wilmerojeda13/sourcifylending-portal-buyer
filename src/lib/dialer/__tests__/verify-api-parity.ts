/**
 * Verification script for dialer reporting parity
 * Run this locally to verify API responses match expected structure
 *
 * Usage in development:
 * 1. Start dev server: npm run dev
 * 2. Call the API with same parameters:
 *    - /api/admin/dialer/analytics (no filters)
 *    - Check response has { today: { dials, connects, ... }, week: { ... } }
 * 3. Compare /admin/dialer/campaigns vs /admin/dialer/analytics
 *    - Campaigns page should show same "Today" count as API returns
 *    - Analytics page should show same count when set to same date
 */

export interface ApiResponse {
  today: {
    dials: number
    connects: number
    interested: number
    qualified: number
    promoted: number
    contact_rate: number
    qualified_rate: number
    promoted_rate: number
  }
  week: {
    dials: number
    connects: number
    interested: number
    qualified: number
    promoted: number
    contact_rate: number
    qualified_rate: number
    promoted_rate: number
  }
  timezone: string
}

export function validateApiResponse(response: unknown): response is ApiResponse {
  if (typeof response !== 'object' || response === null) return false
  const r = response as Record<string, any>

  const hasValidMetrics = (obj: any) =>
    typeof obj === 'object' &&
    typeof obj.dials === 'number' &&
    typeof obj.connects === 'number' &&
    typeof obj.interested === 'number' &&
    typeof obj.qualified === 'number' &&
    typeof obj.promoted === 'number' &&
    typeof obj.contact_rate === 'number' &&
    typeof obj.qualified_rate === 'number' &&
    typeof obj.promoted_rate === 'number'

  return (
    hasValidMetrics(r.today) &&
    hasValidMetrics(r.week) &&
    typeof r.timezone === 'string'
  )
}

/**
 * Debug info to log in development
 * Shows the exact date boundaries being used for reporting
 */
export function getDebugInfo(startIso: string, endIso: string, filter: string = 'all') {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    return {
      message: '[Dialer Reporting]',
      startTimestamp: startIso,
      endTimestamp: endIso,
      filter,
      note: 'Both Campaigns and Analytics pages should use these exact boundaries',
    }
  }
  return null
}
