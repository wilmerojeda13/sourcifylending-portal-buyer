import { createServiceClient } from '@/lib/supabase/server'
import { DIALER_TIME_ZONE, getTimeZoneDateKey, getTimeZoneDateRange, getTimeZoneHour } from '@/lib/timezones'

export interface AnalyticsRow {
  id: string
  campaign_id: string | null
  campaign_name: string
  campaign_status: string
  rep_id: string
  rep_name: string
  status: string
  last_called_at: string
  last_call_outcome: string | null
  crm_converted: boolean
  lead_source: string | null
  duration_seconds: number
}

export interface AnalyticsFilters {
  startDate: string
  endDate: string
  campaignId: string
  repId: string
  source: string
}

type SearchParamsLike = Record<string, string | string[] | undefined>

type CampaignRow = {
  id: string
  name: string
  status: string
  created_by: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

type RawLeadRow = {
  id: string
  source: string | null
  promoted_to_crm_lead_id: string | null
}

type CallLogRow = {
  id: string
  lead_id: string
  raw_lead_id: string | null
  campaign_id: string | null
  rep_user_id: string | null
  timestamp: string
  duration_seconds: number
  disposition: string
  lead_source: string | null
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseDateOrDefault(value: string | undefined, fallback: Date) {
  if (!value) return getTimeZoneDateKey(fallback, DIALER_TIME_ZONE)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? getTimeZoneDateKey(fallback, DIALER_TIME_ZONE) : getTimeZoneDateKey(parsed, DIALER_TIME_ZONE)
}

export function getDefaultFilters(searchParams: SearchParamsLike): AnalyticsFilters {
  const end = new Date()
  const endKey = getTimeZoneDateKey(end, DIALER_TIME_ZONE)
  const startSeed = new Date(`${endKey}T00:00:00.000Z`)
  startSeed.setUTCDate(startSeed.getUTCDate() - 29)
  const startKey = getTimeZoneDateKey(startSeed, DIALER_TIME_ZONE)

  return {
    startDate: parseDateOrDefault(firstValue(searchParams.start), new Date(`${startKey}T00:00:00.000Z`)),
    endDate: parseDateOrDefault(firstValue(searchParams.end), new Date(`${endKey}T00:00:00.000Z`)),
    campaignId: firstValue(searchParams.campaign) ?? 'all',
    repId: firstValue(searchParams.rep) ?? 'all',
    source: firstValue(searchParams.source) ?? 'all',
  }
}

function getProfileLabel(profile: ProfileRow | undefined, fallback: string) {
  return profile?.full_name?.trim() || profile?.email?.trim() || fallback
}

export async function getAnalyticsDataset(filters: AnalyticsFilters) {
  const supabase = await createServiceClient()
  const startRange = getTimeZoneDateRange(filters.startDate)
  const endRange = getTimeZoneDateRange(filters.endDate)

  const { data: callRowsRaw, error: callError } = await supabase
    .from('call_logs')
    .select(`
      id,
      lead_id,
      raw_lead_id,
      campaign_id,
      rep_user_id,
      timestamp,
      duration_seconds,
      disposition,
      lead_source
    `)
    .eq('source_system', 'dialer')
    .gte('timestamp', startRange.start.toISOString())
    .lte('timestamp', endRange.end.toISOString())
    .order('timestamp', { ascending: false })
    .range(0, 999999)

  if (callError) throw callError

  const callRows = (callRowsRaw ?? []) as CallLogRow[]
  const campaignIds = Array.from(new Set(callRows.map(row => row.campaign_id).filter((value): value is string => Boolean(value))))
  const repIds = Array.from(new Set(callRows.map(row => row.rep_user_id).filter((value): value is string => Boolean(value))))
  const rawLeadIds = Array.from(new Set(
    callRows
      .map(row => row.raw_lead_id ?? row.lead_id)
      .filter((value): value is string => Boolean(value)),
  ))

  const [campaignResult, profileResult, rawLeadResult] = await Promise.all([
    campaignIds.length > 0
      ? supabase.from('dialer_campaigns').select('id, name, status, created_by').in('id', campaignIds)
      : Promise.resolve({ data: [] as CampaignRow[], error: null }),
    repIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', repIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    rawLeadIds.length > 0
      ? supabase.from('dialer_raw_leads').select('id, source, promoted_to_crm_lead_id').in('id', rawLeadIds)
      : Promise.resolve({ data: [] as RawLeadRow[], error: null }),
  ])

  const campaigns = (campaignResult.data ?? []) as CampaignRow[]
  const campaignMap = new Map(campaigns.map(campaign => [campaign.id, campaign]))
  const profiles = (profileResult.data ?? []) as ProfileRow[]
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]))
  const rawLeads = (rawLeadResult.data ?? []) as RawLeadRow[]
  const rawLeadMap = new Map(rawLeads.map(rawLead => [rawLead.id, rawLead]))

  const rows = callRows
    .map(row => {
      const campaign = row.campaign_id ? campaignMap.get(row.campaign_id) : undefined
      const repProfile = row.rep_user_id ? profileMap.get(row.rep_user_id) : undefined
      const rawLead = rawLeadMap.get(row.raw_lead_id ?? row.lead_id)
      const campaignRepProfile = campaign?.created_by ? profileMap.get(campaign.created_by) : undefined
      const campaignRepLabel = campaign?.created_by ? getProfileLabel(campaignRepProfile, 'Unassigned') : 'Unassigned'

      return {
        id: row.id,
        campaign_id: row.campaign_id,
        campaign_name: campaign?.name ?? 'Standalone dial',
        campaign_status: campaign?.status ?? 'unknown',
        rep_id: row.rep_user_id ?? campaign?.created_by ?? row.id,
        rep_name: getProfileLabel(repProfile, campaignRepLabel),
        status: row.disposition,
        last_called_at: row.timestamp,
        last_call_outcome: row.disposition,
        crm_converted: Boolean(rawLead?.promoted_to_crm_lead_id),
        lead_source: row.lead_source ?? rawLead?.source ?? null,
        duration_seconds: row.duration_seconds,
      } satisfies AnalyticsRow
    })
    .filter(row => {
      if (filters.campaignId !== 'all' && row.campaign_id !== filters.campaignId) return false
      if (filters.repId !== 'all' && row.rep_id !== filters.repId) return false
      if (filters.source !== 'all' && (row.lead_source ?? 'unknown') !== filters.source) return false
      return true
    })

  const repOptions = Array.from(
    new Map(
      rows.map(row => [row.rep_id, row.rep_name]),
    ).entries(),
  ).map(([id, label]) => ({ id, label }))

  const sourceOptions = Array.from(
    new Set(
      rows
        .map(row => row.lead_source?.trim())
        .filter((source): source is string => Boolean(source)),
    ),
  ).sort((a, b) => a.localeCompare(b))

  return {
    campaigns: campaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    })),
    repOptions,
    rows,
    sourceOptions,
  }
}

export function getAnalyticsRowDateKey(value: string) {
  return getTimeZoneDateKey(new Date(value), DIALER_TIME_ZONE)
}

export function getAnalyticsRowHour(value: string) {
  return getTimeZoneHour(new Date(value), DIALER_TIME_ZONE)
}

export function getAnalyticsDayBounds(date = new Date()) {
  return getTimeZoneDateRange(getTimeZoneDateKey(date, DIALER_TIME_ZONE), DIALER_TIME_ZONE)
}
