import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const metadata = { title: 'Dialer' }

export default async function DialerPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')
  redirect('/admin/dialer/campaigns')
}
