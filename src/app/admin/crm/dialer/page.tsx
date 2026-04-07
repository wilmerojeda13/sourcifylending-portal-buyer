import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import SimpleDialerClient from '@/components/admin/crm/dialer/SimpleDialerClient'

export const metadata = { title: 'Dialer Mode — CRM' }

export default async function DialerPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')
  return <SimpleDialerClient />
}
