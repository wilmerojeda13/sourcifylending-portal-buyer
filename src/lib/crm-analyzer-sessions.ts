import type { SupabaseClient } from '@supabase/supabase-js'
import { createCrmLeadActivity, getAppUrl } from '@/lib/crm-invites'
import { logPortalEvent } from '@/lib/portal-events'

export const CRM_ANALYZER_SESSION_COOKIE = 'crm_analyzer_session'

export const CRM_ANALYZER_EVENT_TYPES = [
  'link_sent',
  'link_opened',
  'analyzer_started',
  'analyzer_submitted',
  'readiness_score_generated',
  'account_created',
  'converted',
] as const

export type CrmAnalyzerEventType = (typeof CRM_ANALYZER_EVENT_TYPES)[number]

export type CrmAnalyzerSessionRow = {
  id: string
  lead_id: string
  rep_user_id: string | null
  rep_name: string | null
  source_context: string | null
  crm_invite_id: string | null
  crm_sms_id: string | null
  session_status: CrmAnalyzerEventType | null
  tracked_url: string | null
  link_sent_at: string | null
  link_opened_at: string | null
  analyzer_started_at: string | null
  analyzer_submitted_at: string | null
  readiness_score: number | null
  readiness_status: string | null
  analyzer_summary: string | null
  score_breakdown: Record<string, unknown> | null
  account_created: boolean | null
  account_created_at: string | null
  converted_at: string | null
  latest_event_type: CrmAnalyzerEventType | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

export type CrmAnalyzerEventRow = {
  id: string
  session_id: string
  lead_id: string
  rep_user_id: string | null
  event_type: CrmAnalyzerEventType
  event_at: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const SESSION_SELECT = [
  'id',
  'lead_id',
  'rep_user_id',
  'rep_name',
  'source_context',
  'crm_invite_id',
  'crm_sms_id',
  'session_status',
  'tracked_url',
  'link_sent_at',
  'link_opened_at',
  'analyzer_started_at',
  'analyzer_submitted_at',
  'readiness_score',
  'readiness_status',
  'analyzer_summary',
  'score_breakdown',
  'account_created',
  'account_created_at',
  'converted_at',
  'latest_event_type',
  'last_event_at',
  'created_at',
  'updated_at',
].join(', ')

const EVENT_SELECT = [
  'id',
  'session_id',
  'lead_id',
  'rep_user_id',
  'event_type',
  'event_at',
  'metadata',
  'created_at',
].join(', ')

function coerceIso(value?: string | null) {
  return value ?? new Date().toISOString()
}

function buildSessionLink(sessionId: string, origin?: string | null) {
  const base = getAppUrl(origin ?? undefined)
  return `${base}/analyzer?${new URLSearchParams({ [CRM_ANALYZER_SESSION_COOKIE]: sessionId }).toString()}`
}

async function refreshLeadAnalyzerSnapshot(
  supabase: SupabaseClient,
  session: CrmAnalyzerSessionRow,
) {
  await supabase
    .from('crm_leads')
    .update({
      latest_analyzer_session_id: session.id,
      latest_analyzer_session_status: session.latest_event_type ?? session.session_status,
      latest_analyzer_session_at: session.last_event_at ?? session.updated_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.lead_id)
}

async function appendSessionActivity(
  supabase: SupabaseClient,
  session: CrmAnalyzerSessionRow,
  eventType: CrmAnalyzerEventType,
  eventAt: string,
  metadata?: Record<string, unknown> | null,
) {
  const bodyByType: Record<CrmAnalyzerEventType, string> = {
    link_sent: `Live analyzer link sent${session.rep_name ? ` by ${session.rep_name}` : ''}.`,
    link_opened: 'Prospect opened the live analyzer link.',
    analyzer_started: 'Prospect started the analyzer.',
    analyzer_submitted: 'Prospect submitted the analyzer.',
    readiness_score_generated: `Readiness score generated${typeof session.readiness_score === 'number' ? `: ${session.readiness_score}/100` : '.'}`,
    account_created: 'Prospect created a free account from the analyzer flow.',
    converted: 'Lead converted after the analyzer session.',
  }

  await createCrmLeadActivity(
    supabase,
    session.lead_id,
    'note',
    bodyByType[eventType],
    session.rep_name || 'live_analyzer',
    {
      event_type: eventType,
      analyzer_session_id: session.id,
      event_at: eventAt,
      ...(metadata ?? {}),
    },
  ).catch(() => {})
}

async function loadSession(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('crm_analyzer_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .single<CrmAnalyzerSessionRow>()

  if (error || !data) throw error ?? new Error('Analyzer session not found')
  return data
}

export function buildTrackedAnalyzerLink(sessionId: string, origin?: string | null) {
  return buildSessionLink(sessionId, origin)
}

export async function createTrackedAnalyzerSession(opts: {
  supabase: SupabaseClient
  leadId: string
  repUserId?: string | null
  repName?: string | null
  sourceContext: string
  origin?: string | null
  crmInviteId?: string | null
  crmSmsId?: string | null
  metadata?: Record<string, unknown>
}) {
  const now = new Date().toISOString()
  const { data, error } = await opts.supabase
    .from('crm_analyzer_sessions')
    .insert({
      lead_id: opts.leadId,
      rep_user_id: opts.repUserId ?? null,
      rep_name: opts.repName ?? null,
      source_context: opts.sourceContext,
      crm_invite_id: opts.crmInviteId ?? null,
      crm_sms_id: opts.crmSmsId ?? null,
      session_status: 'link_sent',
      latest_event_type: 'link_sent',
      link_sent_at: now,
      last_event_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(SESSION_SELECT)
    .single<CrmAnalyzerSessionRow>()

  if (error || !data) throw error ?? new Error('Failed to create analyzer session')
  const createdSession = data

  const trackedUrl = buildSessionLink(createdSession.id, opts.origin)
  const { data: updated, error: updateError } = await opts.supabase
    .from('crm_analyzer_sessions')
    .update({
      tracked_url: trackedUrl,
      updated_at: now,
    })
    .eq('id', createdSession.id)
    .select(SESSION_SELECT)
    .single<CrmAnalyzerSessionRow>()

  if (updateError || !updated) throw updateError ?? new Error('Failed to finalize analyzer session')
  const updatedSession = updated

  await opts.supabase.from('crm_analyzer_events').insert({
    session_id: updatedSession.id,
    lead_id: updatedSession.lead_id,
    rep_user_id: updatedSession.rep_user_id,
    event_type: 'link_sent',
    event_at: now,
    metadata: {
      source_context: opts.sourceContext,
      tracked_url: trackedUrl,
      ...(opts.metadata ?? {}),
    },
    created_at: now,
  })

  await refreshLeadAnalyzerSnapshot(opts.supabase, updatedSession).catch(() => {})
  await appendSessionActivity(opts.supabase, updatedSession, 'link_sent', now, {
    source_context: opts.sourceContext,
  })
  await logPortalEvent({
    userId: opts.repUserId ?? undefined,
    eventType: 'analyzer_link_sent',
    category: 'leads',
    severity: 'info',
    title: 'Live analyzer link sent',
    message: updatedSession.lead_id,
    metadata: {
      lead_id: updatedSession.lead_id,
      analyzer_session_id: updatedSession.id,
      source_context: opts.sourceContext,
      crm_invite_id: opts.crmInviteId ?? null,
      crm_sms_id: opts.crmSmsId ?? null,
    },
  }).catch(() => {})

  return {
    session: updatedSession,
    trackedUrl,
  }
}

export async function recordAnalyzerSessionEvent(opts: {
  supabase: SupabaseClient
  sessionId: string
  eventType: CrmAnalyzerEventType
  eventAt?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const eventAt = coerceIso(opts.eventAt)
  const session = await loadSession(opts.supabase, opts.sessionId)

  await opts.supabase.from('crm_analyzer_events').insert({
    session_id: session.id,
    lead_id: session.lead_id,
    rep_user_id: session.rep_user_id,
    event_type: opts.eventType,
    event_at: eventAt,
    metadata: opts.metadata ?? {},
    created_at: eventAt,
  })

  const updates: Record<string, unknown> = {
    session_status: opts.eventType,
    latest_event_type: opts.eventType,
    last_event_at: eventAt,
    updated_at: eventAt,
  }

  if (opts.eventType === 'link_opened') updates.link_opened_at = session.link_opened_at ?? eventAt
  if (opts.eventType === 'analyzer_started') updates.analyzer_started_at = session.analyzer_started_at ?? eventAt
  if (opts.eventType === 'analyzer_submitted') updates.analyzer_submitted_at = session.analyzer_submitted_at ?? eventAt
  if (opts.eventType === 'readiness_score_generated') {
    updates.analyzer_submitted_at = session.analyzer_submitted_at ?? eventAt
    updates.readiness_score = typeof opts.metadata?.readiness_score === 'number' ? opts.metadata.readiness_score : session.readiness_score
    updates.readiness_status = typeof opts.metadata?.readiness_status === 'string' ? opts.metadata.readiness_status : session.readiness_status
    updates.analyzer_summary = typeof opts.metadata?.analyzer_summary === 'string' ? opts.metadata.analyzer_summary : session.analyzer_summary
    updates.score_breakdown = (opts.metadata?.score_breakdown as Record<string, unknown> | undefined) ?? session.score_breakdown
  }
  if (opts.eventType === 'account_created') {
    updates.account_created = true
    updates.account_created_at = session.account_created_at ?? eventAt
  }
  if (opts.eventType === 'converted') updates.converted_at = session.converted_at ?? eventAt

  const { data, error } = await opts.supabase
    .from('crm_analyzer_sessions')
    .update(updates)
    .eq('id', session.id)
    .select(SESSION_SELECT)
    .single<CrmAnalyzerSessionRow>()

  if (error || !data) throw error ?? new Error('Failed to update analyzer session')
  const updatedSession = data

  await refreshLeadAnalyzerSnapshot(opts.supabase, updatedSession).catch(() => {})
  await appendSessionActivity(opts.supabase, updatedSession, opts.eventType, eventAt, opts.metadata)
  return updatedSession
}

export async function listLeadAnalyzerSessions(
  supabase: SupabaseClient,
  leadId: string,
) {
  const [sessionsRes, eventsRes] = await Promise.all([
    supabase
      .from('crm_analyzer_sessions')
      .select(SESSION_SELECT)
      .eq('lead_id', leadId)
      .order('last_event_at', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from('crm_analyzer_events')
      .select(EVENT_SELECT)
      .eq('lead_id', leadId)
      .order('event_at', { ascending: false })
      .limit(50),
  ])

  if (sessionsRes.error) throw sessionsRes.error
  if (eventsRes.error) throw eventsRes.error

  const sessions = (sessionsRes.data ?? []) as unknown as CrmAnalyzerSessionRow[]
  const events = (eventsRes.data ?? []) as unknown as CrmAnalyzerEventRow[]

  return {
    sessions,
    events,
    latestSession: sessions[0] ?? null,
  }
}

export async function getLatestLeadAnalyzerSession(
  supabase: SupabaseClient,
  leadId: string,
) {
  const { data, error } = await supabase
    .from('crm_analyzer_sessions')
    .select(SESSION_SELECT)
    .eq('lead_id', leadId)
    .order('last_event_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<CrmAnalyzerSessionRow>()

  if (error) throw error
  return data ?? null
}
