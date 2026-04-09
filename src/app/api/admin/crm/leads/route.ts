import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { getLeadCompliance, inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'
import { getLeadDialerPriority } from '@/lib/crm-dialer'
import { getCrmInviteSummaryMap } from '@/lib/crm-invites'
import { getCrmSmsSummaryMap } from '@/lib/crm-sms'
import { checkDialerEligibility, matchesDialerQueueFilter, type DialerQueueFilter } from '@/lib/crm-dialer-eligibility'
import { getTagsForEntities, matchesCrmTagFilters } from '@/lib/crm-tags'
import { 
  rankSearchResults, 
  normalizePhoneForSearch,
  normalizeText,
  type UnifiedSearchResult 
} from '@/lib/crm-unified-search'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

function isMissingLeadTimezoneColumn(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === '42703' || error?.message?.includes('crm_leads.phone_e164 does not exist') || false
}

// GET /api/admin/crm/leads?stage=&source=&program=&search=&follow_up_due=&archived=&temperature=&callback_due=&open_tasks=&unified_search=true
export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stage        = searchParams.get('stage')
  const source       = searchParams.get('source')
  const program      = searchParams.get('program')
  const search       = searchParams.get('search')
  const followUpDue  = searchParams.get('follow_up_due')
  const callbackDue  = searchParams.get('callback_due')
  const temperature  = searchParams.get('temperature')
  const openTasks    = searchParams.get('open_tasks')
  const callability  = searchParams.get('callability')
  const owner        = searchParams.get('owner')
  const disposition  = searchParams.get('disposition')
  const dialerMode   = searchParams.get('dialer_mode') === 'true'
  const dialerQueue  = searchParams.get('queue') as DialerQueueFilter | null
  const tagIds       = searchParams.getAll('tag_id')
  const excludeTagIds = searchParams.getAll('exclude_tag_id')
  const tagMode = searchParams.get('tag_mode') === 'all' ? 'all' : 'any'
  const archived     = searchParams.get('archived') === 'true'
  // Use unified search for client-side ranking (default: true for search queries)
  const unifiedSearch = searchParams.get('unified_search') !== 'false' && !!search

  const requiresPostFilter = callability === 'callable_now' || callability === 'blocked_by_timezone' || callability === 'unknown_timezone'
  const applyLeadFilters = (query: any) => {
    let nextQuery: any = query.eq('is_archived', archived)
    if (stage) nextQuery = nextQuery.eq('stage', stage)
    if (source) nextQuery = nextQuery.eq('source', source)
    if (program) nextQuery = nextQuery.eq('program_interest', program)
    if (temperature) nextQuery = nextQuery.eq('lead_temperature', temperature)
    if (owner === 'unassigned') {
      nextQuery = nextQuery.is('assigned_to_user_id', null)
    } else if (owner) {
      nextQuery = nextQuery.eq('assigned_to_user_id', owner)
    }
    if (disposition) nextQuery = nextQuery.eq('last_call_outcome', disposition)
    if (followUpDue === 'true') {
      nextQuery = nextQuery.lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
    }
    if (callbackDue === 'true') {
      nextQuery = nextQuery.lte('callback_due_at', new Date().toISOString()).not('callback_due_at', 'is', null)
    }
    // When using unified search, fetch more leads for client-side ranking
    // Otherwise use the original ILIKE search for database-side filtering
    if (search) {
      if (unifiedSearch) {
        // For unified search, we fetch broader results and rank client-side
        // Use partial matching to get candidates - includes notes for comprehensive search
        const searchNorm = normalizeText(search)
        const phoneDigits = normalizePhoneForSearch(search)
        nextQuery = nextQuery.or(
          `first_name.ilike.%${searchNorm}%,last_name.ilike.%${searchNorm}%,email.ilike.%${searchNorm}%,business_name.ilike.%${searchNorm}%,notes.ilike.%${searchNorm}%${phoneDigits ? `,phone_digits.ilike.%${phoneDigits}%` : ''}`
        )
      } else {
        // Original behavior: database-side filtering
        nextQuery = nextQuery.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%,notes.ilike.%${search}%,phone.ilike.%${search}%`
        )
      }
    }
    return nextQuery
      .order('follow_up_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
  }

  const page  = parseInt(searchParams.get('page')  ?? '0')
  const limit = parseInt(searchParams.get('limit') ?? '1000')
  let leads: any[] = []
  let count: number | null = null

  if (dialerMode) {
    const chunkSize = 1000
    let from = 0

    while (true) {
      const query = applyLeadFilters(
        supabase
          .from('crm_leads')
          .select('*', { count: from === 0 ? 'exact' : undefined })
          .range(from, from + chunkSize - 1)
      )
      const { data, error, count: batchCount } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (from === 0) {
        count = batchCount ?? 0
      }

      const batch = data ?? []
      leads.push(...batch)

      if (batch.length < chunkSize) {
        break
      }

      from += chunkSize
    }
  } else {
    // For unified search, fetch up to 500 candidates for client-side ranking
    // This provides a good balance between coverage and performance
    const searchFetchLimit = unifiedSearch ? Math.min(limit * 5, 500) : limit
    
    let query = applyLeadFilters(
      supabase
        .from('crm_leads')
        .select('*', { count: 'exact' })
    )

    if (!requiresPostFilter) {
      query = query.range(page * searchFetchLimit, (page + 1) * searchFetchLimit - 1)
    }

    const { data, error, count: queryCount } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    leads = data ?? []
    count = queryCount ?? 0
  }

  if (openTasks === 'true' && leads.length > 0) {
    const leadIds = leads.map(lead => lead.id)
    const { data: tasks } = await supabase
      .from('crm_tasks')
      .select('lead_id')
      .in('lead_id', leadIds)
      .neq('status', 'Done')

    const activeLeadIds = new Set((tasks ?? []).map(task => task.lead_id))
    leads = leads.filter(lead => activeLeadIds.has(lead.id))
  }

  const enrichedLeadPairs = await Promise.all(
    leads.map(async (lead) => {
      const compliance = await getLeadCompliance(lead)
      return {
        original: lead,
        enriched: {
          ...lead,
          ...compliance,
        },
      }
    })
  )

  const normalizedLeads = enrichedLeadPairs.map(({ original, enriched }) => {
    const needsPersist =
      original.phone_e164 !== enriched.phone_e164 ||
      (original.likely_timezone ?? null) !== (enriched.likely_timezone ?? null) ||
      (original.timezone_confidence ?? 'unknown') !== enriched.timezone_confidence ||
      (original.timezone_source ?? null) !== (enriched.timezone_source ?? null)

    if (needsPersist) {
      void supabase
        .from('crm_leads')
        .update({
          phone_e164: enriched.phone_e164,
          likely_timezone: enriched.likely_timezone,
          timezone_confidence: enriched.timezone_confidence,
          timezone_source: enriched.timezone_source,
          last_timezone_checked_at: enriched.last_timezone_checked_at,
        })
        .eq('id', enriched.id)
    }

    return enriched
  })

  const filteredLeads = requiresPostFilter
    ? normalizedLeads.filter(lead => lead.call_window_status === callability)
    : normalizedLeads

  const leadTagMap = await getTagsForEntities(supabase, 'lead', filteredLeads.map((lead) => lead.id))
  const tagFilteredLeads = (tagIds.length > 0 || excludeTagIds.length > 0)
    ? filteredLeads.filter((lead) => {
      const tags = leadTagMap.get(lead.id) ?? []
      return matchesCrmTagFilters(tags.map((tag) => tag.id), {
        includeTagIds: tagIds,
        excludeTagIds,
        mode: tagMode,
      })
      })
    : filteredLeads

  const dialerEligibleLeads = dialerMode
    ? tagFilteredLeads
      .filter((lead) => {
        const eligibility = checkDialerEligibility(lead)

        if (!eligibility.is_eligible) {
          console.log(`Lead ${lead.id} excluded from dialer: ${eligibility.exclusion_reason}`)
          return false
        }

        if (!matchesDialerQueueFilter(lead, dialerQueue)) {
          return false
        }

        return true
      })
      .sort((a, b) => getLeadDialerPriority(b) - getLeadDialerPriority(a))
    : tagFilteredLeads

  const pagedLeads = requiresPostFilter || dialerMode
    ? dialerEligibleLeads.slice(page * limit, (page + 1) * limit)
    : dialerEligibleLeads

  const duplicatePhoneCounts = new Map<string, number>()
  for (const lead of dialerEligibleLeads) {
    const key = lead.phone_e164 || lead.phone
    if (!key) continue
    duplicatePhoneCounts.set(key, (duplicatePhoneCounts.get(key) ?? 0) + 1)
  }

  const inviteSummaryMap = await getCrmInviteSummaryMap(
    supabase,
    pagedLeads.map(lead => lead.id),
  )
  const smsSummaryMap = await getCrmSmsSummaryMap(
    supabase,
    pagedLeads.map(lead => lead.id),
  )

  // Apply unified search ranking if enabled
  let searchResults: UnifiedSearchResult<any>[] | null = null
  if (unifiedSearch && search && pagedLeads.length > 0) {
    searchResults = rankSearchResults(pagedLeads, search, { limit })
  }

  const responseLeads = (searchResults ?? pagedLeads.map(lead => ({
    ...lead,
    search_match: null as { primaryMatch: string; score: number; matchedField: string } | null,
  }))).map((result: any) => {
    const lead = typeof result.lead === 'object' ? result.lead : result
    const searchMatch = typeof result.lead === 'object' ? {
      primaryMatch: result.primaryMatch,
      score: result.score,
      matchedField: result.matches?.[0]?.field ?? null,
    } : null
    
    return {
      ...lead,
      search_match: searchMatch,
      duplicate_phone_count: duplicatePhoneCounts.get(lead.phone_e164 || lead.phone || '') ?? 0,
      phone_invalid: !lead.phone_e164,
      tags: leadTagMap.get(lead.id) ?? [],
      ...(inviteSummaryMap.get(lead.id) ?? {}),
      ...(smsSummaryMap.get(lead.id) ?? {}),
    }
  })

  return NextResponse.json({
    leads: responseLeads,
    total: requiresPostFilter || dialerMode ? dialerEligibleLeads.length : (openTasks === 'true' ? dialerEligibleLeads.length : count ?? 0),
    page,
    limit,
    search_used: unifiedSearch && !!search ? 'unified' : 'standard',
  })
}

// POST /api/admin/crm/leads
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.first_name?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: 'First name and phone are required' }, { status: 400 })
  }

  const phoneIntelligence = await inferLeadPhoneIntelligence(body.phone.trim())

  // Duplicate phone check — block creation if a lead with the same phone already exists
  const normalizedPhone = phoneIntelligence.phone_e164 || body.phone.trim()
  const { data: existingDupe } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, stage')
    .or(`phone_e164.eq.${normalizedPhone},phone.eq.${body.phone.trim()}`)
    .limit(1)
    .maybeSingle()

  if (existingDupe) {
    return NextResponse.json({
      error: `A lead with this phone number already exists: ${existingDupe.first_name} ${existingDupe.last_name} (${existingDupe.stage})`,
      duplicate_lead_id: existingDupe.id,
    }, { status: 409 })
  }

  const baseInsert = {
    first_name:       body.first_name.trim(),
    last_name:        body.last_name?.trim() ?? '',
    phone:            body.phone.trim(),
    email:            body.email?.trim() || null,
    business_name:    body.business_name?.trim() || null,
    stage:            body.stage ?? 'new',
    program_interest: body.program_interest || null,
    source:           body.source ?? 'manual',
    notes:            body.notes?.trim() || null,
    follow_up_at:     body.follow_up_at || null,
  }

  let { data, error } = await supabase
    .from('crm_leads')
    .insert({
      ...baseInsert,
      phone_e164:       phoneIntelligence.phone_e164,
      likely_timezone:  phoneIntelligence.likely_timezone,
      timezone_confidence:      phoneIntelligence.timezone_confidence,
      timezone_source:          phoneIntelligence.timezone_source,
      last_timezone_checked_at: phoneIntelligence.last_timezone_checked_at,
    })
    .select()
    .single()

  if (isMissingLeadTimezoneColumn(error)) {
    ;({ data, error } = await supabase
      .from('crm_leads')
      .insert(baseInsert)
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to activity feed
  logPortalEvent({
    eventType: 'crm_lead_added',
    category: 'leads',
    title: `New CRM Lead: ${body.first_name.trim()} ${body.last_name?.trim() ?? ''}`.trim(),
    message: `Lead manually added to CRM.`,
    metadata: {
      phone: body.phone.trim(),
      ...(body.email ? { email: body.email.trim() } : {}),
      ...(body.business_name ? { business: body.business_name.trim() } : {}),
      stage: body.stage ?? 'new',
      source: body.source ?? 'manual',
    },
    severity: 'info',
  }).catch(() => {})

  return NextResponse.json({ lead: data }, { status: 201 })
}
