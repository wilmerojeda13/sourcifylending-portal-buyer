import { redirect, notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMissingRelationError } from '@/lib/supabase-schema'
import { getLeadCompliance } from '@/lib/crm-call-compliance'
import { buildCrmInviteSummary, getCrmInviteRows } from '@/lib/crm-invites'
import { buildCrmSmsSummary, getCrmSmsRows } from '@/lib/crm-sms'
import LeadDetailClient from './LeadDetailClient'

export const metadata = { title: 'Lead Detail' }

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin, email').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  const { id } = await params
  const { data: lead, error } = await supabase.from('crm_leads').select('*').eq('id', id).single()
  if (error || !lead) notFound()

  const leadCompliance = await getLeadCompliance(lead)
  const hydratedLead = { ...lead, ...leadCompliance }

  if (
    lead.phone_e164 !== hydratedLead.phone_e164 ||
    (lead.likely_timezone ?? null) !== (hydratedLead.likely_timezone ?? null) ||
    (lead.timezone_confidence ?? 'unknown') !== hydratedLead.timezone_confidence ||
    (lead.timezone_source ?? null) !== (hydratedLead.timezone_source ?? null)
  ) {
    void supabase
      .from('crm_leads')
      .update({
        phone_e164: hydratedLead.phone_e164,
        likely_timezone: hydratedLead.likely_timezone,
        timezone_confidence: hydratedLead.timezone_confidence,
        timezone_source: hydratedLead.timezone_source,
        last_timezone_checked_at: hydratedLead.last_timezone_checked_at,
      })
      .eq('id', id)
  }

  const { data: activities } = await supabase
    .from('crm_activities')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  const { data: calls, error: callsError } = await supabase
    .from('crm_calls')
    .select('*')
    .eq('lead_id', id)
    .order('call_started_at', { ascending: false })
    .limit(10)

  if (callsError && !isMissingRelationError(callsError, 'crm_calls')) {
    console.error('Failed to load crm_calls on lead detail page', callsError)
  }

  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('*')
    .eq('lead_id', id)
    .order('due_at', { ascending: true, nullsFirst: false })

  const invites = await getCrmInviteRows(supabase, id)
  const inviteSummary = buildCrmInviteSummary(invites)
  const smsRows = await getCrmSmsRows(supabase, id)
  const unreadSmsIds = smsRows.filter(row => row.direction === 'inbound' && row.unread).map(row => row.id)
  let hydratedSmsRows = smsRows

  if (unreadSmsIds.length > 0) {
    const readAt = new Date().toISOString()
    hydratedSmsRows = smsRows.map((row) => (
      unreadSmsIds.includes(row.id)
        ? { ...row, unread: false, read_at: readAt }
        : row
    ))

    void supabase
      .from('crm_lead_sms')
      .update({
        unread: false,
        read_at: readAt,
      })
      .in('id', unreadSmsIds)
  }

  const smsSummary = buildCrmSmsSummary(hydratedSmsRows)

  return (
    <LeadDetailClient
      lead={{ ...hydratedLead, ...inviteSummary, ...smsSummary }}
      activities={activities ?? []}
      calls={calls ?? []}
      tasks={tasks ?? []}
      invites={invites}
      smsMessages={hydratedSmsRows}
      adminEmail={profile.email ?? ''}
    />
  )
}
