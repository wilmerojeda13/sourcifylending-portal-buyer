export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import SupportAdminClient from './SupportAdminClient'

export default async function AdminSupportPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const { data: messages } = await supabase
    .from('support_messages')
    .select('id, user_id, user_email, subject, message, status, admin_reply, attachment_url, created_at, updated_at, profiles!support_messages_user_id_fkey(full_name, business_name)')
    .order('created_at', { ascending: false })

  return <SupportAdminClient initialMessages={messages ?? []} />
}
