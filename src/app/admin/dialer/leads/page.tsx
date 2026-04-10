import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import DialerLeadsClient from './DialerLeadsClient'

export const metadata = { title: 'Leads — Dialer' }

export default async function DialerLeadsPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <DialerNav />
      <DialerLeadsClient />
    </div>
  )
}
