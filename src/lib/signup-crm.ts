import type { createServiceClient } from '@/lib/supabase/server'
import type { ComplianceSnapshot } from '@/lib/public-form-compliance'
import type { AnalyzerResult } from '@/types'
import { syncSignupLeadLifecycle } from '@/lib/crm-lead-lifecycle'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

export async function ensureSignupCrmLead({
  supabase,
  userId,
  fullName,
  email,
  businessName,
  phone,
  source,
  suspicious,
  riskScore,
  reasons,
  complianceSnapshot,
  analyzerResult,
}: {
  supabase: SupabaseClientLike
  userId: string
  fullName: string
  email: string
  businessName?: string | null
  phone?: string | null
  source: 'email_password' | 'google_oauth' | 'create_prospect' | 'admin_manual'
  suspicious: boolean
  riskScore?: number | null
  reasons?: string[]
  complianceSnapshot?: ComplianceSnapshot
  analyzerResult?: AnalyzerResult | null
}) {
  const synced = await syncSignupLeadLifecycle({
    supabase,
    userId,
    fullName,
    email,
    phone,
    businessName,
    source,
    suspicious,
    riskScore,
    reasons,
    complianceSnapshot,
    analyzerResult,
  })

  return {
    leadId: synced.leadId,
    action: synced.action,
    duplicateRisk: synced.duplicateRisk,
    mergedWithAnalyzer: synced.mergedWithAnalyzer,
    notificationSent: synced.notificationSent,
  }
}
