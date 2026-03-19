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

  // Fetch messages, then enrich with profile names separately to avoid FK name issues
  const { data: messages } = await supabase
    .from('support_messages')
    .select('id, user_id, user_email, subject, message, status, admin_reply, attachment_url, created_at, updated_at')
    .order('created_at', { ascending: false })

  // Enrich with profile names
  if (messages && messages.length > 0) {
    const userIds = [...new Set(messages.map(m => m.user_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, business_name')
      .in('id', userIds)

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    messages.forEach((m: Record<string, unknown>) => {
      m.profiles = profileMap[m.user_id as string] ?? null
    })
  }

  return <SupportAdminClient initialMessages={messages ?? []} />
}
