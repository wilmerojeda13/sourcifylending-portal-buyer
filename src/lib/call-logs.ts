import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export type CallLogSourceSystem = 'dialer' | 'crm'

export type CallLogInput = {
  id?: string
  leadId: string
  timestamp?: string
  durationSeconds?: number
  disposition: string
  campaignId?: string | null
  campaignLeadId?: string | null
  rawLeadId?: string | null
  repUserId?: string | null
  leadSource?: string | null
  sourceSystem?: CallLogSourceSystem
}

function normalizeDuration(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 0
  return Math.max(0, Math.floor(value ?? 0))
}

export async function recordCallLog(supabase: ServiceClient, input: CallLogInput) {
  const row = {
    id: input.id ?? crypto.randomUUID(),
    lead_id: input.leadId,
    raw_lead_id: input.rawLeadId ?? input.leadId,
    campaign_lead_id: input.campaignLeadId ?? null,
    campaign_id: input.campaignId ?? null,
    rep_user_id: input.repUserId ?? null,
    source_system: input.sourceSystem ?? 'dialer',
    timestamp: input.timestamp ?? new Date().toISOString(),
    duration_seconds: normalizeDuration(input.durationSeconds),
    disposition: input.disposition,
    lead_source: input.leadSource ?? null,
  }

  const { error, data } = await supabase
    .from('call_logs')
    .upsert(row, { onConflict: 'id' })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    throw error ?? new Error('Failed to record call log.')
  }

  return data
}
