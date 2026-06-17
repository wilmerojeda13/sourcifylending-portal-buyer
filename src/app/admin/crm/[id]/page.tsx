import { redirect, notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getTagsForEntities, type CRMTagRecord } from '@/lib/crm-tags'
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

  // PERFORMANCE: Load only core data for first paint
  // Heavy sections (activities, calls, SMS, calendar) are lazy-loaded client-side
  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('id, title, task_type, priority, status, due_at, notes, created_source, created_source_label')
    .eq('lead_id', id)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(20)

  let leadTagMap = new Map<string, CRMTagRecord[]>()
  try {
    leadTagMap = await getTagsForEntities(supabase, 'lead', [id])
  } catch (error) {
    console.warn('[admin crm] lead tag enrichment failed for detail page', error)
  }

  return (
    <LeadDetailClient
      lead={lead}
      tasks={tasks ?? []}
      tags={leadTagMap.get(id) ?? []}
      adminEmail={profile.email ?? ''}
    />
  )
}
