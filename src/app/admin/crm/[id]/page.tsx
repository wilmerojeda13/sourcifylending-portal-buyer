import { redirect, notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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

  const { data: activities } = await supabase
    .from('crm_activities')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return <LeadDetailClient lead={lead} activities={activities ?? []} adminEmail={profile.email ?? ''} />
}
