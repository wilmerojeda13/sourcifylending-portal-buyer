import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { getLeadCompliance, inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'
import { CRM_DIALER_RETRY_OUTCOMES, getLeadDialerPriority } from '@/lib/crm-dialer'
import { getCrmInviteSummaryMap } from '@/lib/crm-invites'
import { getCrmSmsSummaryMap } from '@/lib/crm-sms'

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

// GET /api/admin/crm/leads?stage=&source=&program=&search=&follow_up_due=&archived=&temperature=&callback_due=&open_tasks=
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
  const dialerMode   = searchParams.get('dialer_mode') === 'true'
  const archived     = searchParams.get('archived') === 'true'

  const requiresPostFilter = callability === 'callable_now' || callability === 'blocked_by_timezone' || callability === 'unknown_timezone'

  let query = supabase
    .from('crm_leads')
    .select('*', { count: 'exact' })
    .eq('is_archived', archived)
    .order('follow_up_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (stage)       query = query.eq('stage', stage)
  if (source)      query = query.eq('source', source)
  if (program)     query = query.eq('program_interest', program)
  if (temperature) query = query.eq('lead_temperature', temperature)
  if (followUpDue === 'true') {
    query = query.lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
  }
  if (callbackDue === 'true') {
    query = query.lte('callback_due_at', new Date().toISOString()).not('callback_due_at', 'is', null)
  }
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  const page  = parseInt(searchParams.get('page')  ?? '0')
  const limit = parseInt(searchParams.get('limit') ?? '1000')
  if (!requiresPostFilter) {
    query = query.range(page * limit, (page + 1) * limit - 1)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let leads = data ?? []

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

  const dialerEligibleLeads = dialerMode
    ? filteredLeads
      .filter((lead) => {
        if (lead.do_not_call) return false

        const callbackDueAt = lead.callback_due_at ? new Date(lead.callback_due_at).getTime() : null
        const followUpAt = lead.follow_up_at ? new Date(lead.follow_up_at).getTime() : null
        const now = Date.now()

        if (callbackDueAt && callbackDueAt > now) return false
        if (followUpAt && followUpAt > now && lead.stage === 'follow_up') return false

        if (lead.last_call_at && CRM_DIALER_RETRY_OUTCOMES.has(lead.last_call_outcome ?? '')) {
          const cooldownHours = lead.last_call_outcome === 'Busy' ? 2 : 4
          const nextEligibleAt = new Date(lead.last_call_at).getTime() + (cooldownHours * 60 * 60 * 1000)
          if (nextEligibleAt > now && !callbackDueAt && !followUpAt) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => getLeadDialerPriority(b) - getLeadDialerPriority(a))
    : filteredLeads

  const pagedLeads = requiresPostFilter
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

  const responseLeads = pagedLeads.map(lead => ({
    ...lead,
    duplicate_phone_count: duplicatePhoneCounts.get(lead.phone_e164 || lead.phone || '') ?? 0,
    phone_invalid: !lead.phone_e164,
    ...(inviteSummaryMap.get(lead.id) ?? {}),
    ...(smsSummaryMap.get(lead.id) ?? {}),
  }))

  return NextResponse.json({
    leads: responseLeads,
    total: requiresPostFilter ? dialerEligibleLeads.length : (openTasks === 'true' ? dialerEligibleLeads.length : count ?? 0),
    page,
    limit,
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
