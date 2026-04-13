import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import DialerHomeClient from './DialerHomeClient'

export const metadata = { title: 'Dialer' }

export default async function DialerRootPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-950">
      <DialerNav />
      <DialerHomeClient />
    </div>
  )
}
