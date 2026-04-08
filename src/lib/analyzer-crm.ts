import type { AnalyzerInput, AnalyzerResult } from '@/types'
import type { createServiceClient } from '@/lib/supabase/server'
import type { ComplianceSnapshot } from '@/lib/public-form-compliance'
import { findMatchingCrmLead, normalizeLeadPhone, syncAnalyzerLeadLifecycle } from '@/lib/crm-lead-lifecycle'

type SupabaseClientLike = Awaited<ReturnType<typeof createServiceClient>>

interface AnalyzerLeadSyncInput {
  supabase: SupabaseClientLike
  fullName: string
  email: string
  phone?: string | null
  businessName?: string | null
  input: AnalyzerInput
  result: AnalyzerResult
  createIfMissing?: boolean
  complianceSnapshot?: ComplianceSnapshot
  userId?: string | null
}

export async function upsertAnalyzerCrmLead({
  supabase,
  fullName,
  email,
  phone,
  businessName,
  input,
  result,
  createIfMissing = true,
  complianceSnapshot,
  userId,
}: AnalyzerLeadSyncInput) {
  if (!createIfMissing) {
    const match = await findMatchingCrmLead(supabase, {
      email,
      phone: normalizeLeadPhone(phone),
    })
    if (!match.primary) {
      return { id: null, action: 'skipped' as const }
    }
  }

  const synced = await syncAnalyzerLeadLifecycle({
    supabase,
    fullName,
    email,
    phone,
    businessName,
    input,
    result,
    rawResultPayload: result as unknown as Record<string, unknown>,
    complianceSnapshot,
    userId,
  })

  return {
    id: synced.leadId,
    action: synced.action,
    duplicateRisk: synced.duplicateRisk,
    taskCreated: synced.taskCreated,
    notificationSent: synced.notificationSent,
  }
}
