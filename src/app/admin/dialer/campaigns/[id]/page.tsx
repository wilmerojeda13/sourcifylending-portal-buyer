import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import CampaignDetailClient from './CampaignDetailClient'

export const metadata = { title: 'Campaign — Dialer' }

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <DialerNav />
      <CampaignDetailClient campaignId={params.id} />
    </div>
  )
}
