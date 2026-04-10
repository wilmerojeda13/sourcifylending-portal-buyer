import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import CampaignListClient from './CampaignListClient'

export const metadata = { title: 'Campaigns — Dialer' }

export default async function CampaignsPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <DialerNav />
      <CampaignListClient />
    </div>
  )
}
