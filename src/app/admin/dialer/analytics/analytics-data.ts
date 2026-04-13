import { createServiceClient } from '@/lib/supabase/server'

export interface AnalyticsRow {
  id: string
  campaign_id: string
  campaign_name: string
  campaign_status: string
  rep_id: string
  rep_name: string
  status: string
  last_called_at: string
  last_call_outcome: string | null
  crm_converted: boolean
  lead_source: string | null
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
  created_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

type CampaignLeadRow = {
  id: string
  campaign_id: string
  raw_lead_id: string
  status: string
  last_call_outcome: string | null
  last_called_at: string | null
}

type RawLeadRow = {
  id: string
  source: string | null
  promoted_to_crm_lead_id: string | null
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function parseDateOrDefault(value: string | undefined, fallback: Date) {
  if (!value) return formatDate(fallback)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? formatDate(fallback) : formatDate(parsed)
}

function buildDefaultWindow() {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 29)
  return { start, end }
}

export function getDefaultFilters(searchParams: SearchParamsLike): AnalyticsFilters {
  const { start, end } = buildDefaultWindow()

  return {
    startDate: parseDateOrDefault(firstValue(searchParams.start), start),
    endDate: parseDateOrDefault(firstValue(searchParams.end), end),
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

  const [campaignResult, leadResult, profileResult] = await Promise.all([
    supabase
      .from('dialer_campaigns')
      .select('id, name, status, created_by, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('dialer_campaign_leads')
      .select(`
        id,
        campaign_id,
        raw_lead_id,
        status,
        last_call_outcome,
        last_called_at
      `)
      .not('last_called_at', 'is', null)
      .gte('last_called_at', `${filters.startDate}T00:00:00.000Z`)
      .lte('last_called_at', `${filters.endDate}T23:59:59.999Z`)
      .range(0, 999999),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .range(0, 999999),
  ])

  const campaigns = (campaignResult.data ?? []) as CampaignRow[]
  const campaignMap = new Map(campaigns.map(campaign => [campaign.id, campaign]))
  const profiles = (profileResult.data ?? []) as ProfileRow[]
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]))
  const rawLeadIds = Array.from(new Set(((leadResult.data ?? []) as CampaignLeadRow[]).map(row => row.raw_lead_id)))
  const rawLeadResult = rawLeadIds.length > 0
    ? await supabase
      .from('dialer_raw_leads')
      .select('id, source, promoted_to_crm_lead_id')
      .in('id', rawLeadIds)
    : { data: [], error: null }
  const rawLeads = (rawLeadResult.data ?? []) as RawLeadRow[]
  const rawLeadMap = new Map(rawLeads.map(rawLead => [rawLead.id, rawLead]))

  const rows = ((leadResult.data ?? []) as CampaignLeadRow[])
    .map(row => {
      const campaign = campaignMap.get(row.campaign_id)
      const ownerProfile = campaign?.created_by ? profileMap.get(campaign.created_by) : undefined
      const rawLead = rawLeadMap.get(row.raw_lead_id) ?? null

      return {
        id: row.id,
        campaign_id: row.campaign_id,
        campaign_name: campaign?.name ?? 'Unknown campaign',
        campaign_status: campaign?.status ?? 'unknown',
        rep_id: campaign?.created_by ?? row.campaign_id,
        rep_name: getProfileLabel(ownerProfile, campaign?.name ?? 'Unassigned'),
        status: row.status,
        last_called_at: row.last_called_at ?? `${filters.startDate}T00:00:00.000Z`,
        last_call_outcome: row.last_call_outcome,
        crm_converted: Boolean(rawLead?.promoted_to_crm_lead_id),
        lead_source: rawLead?.source ?? null,
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
      campaigns.map(campaign => {
        const profile = campaign.created_by ? profileMap.get(campaign.created_by) : undefined
        return [campaign.created_by ?? campaign.id, getProfileLabel(profile, campaign.name)]
      })
    ).entries()
  ).map(([id, label]) => ({ id, label }))

  const sourceOptions = Array.from(
    new Set(
      rows
        .map(row => row.lead_source?.trim())
        .filter((source): source is string => Boolean(source))
    )
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
