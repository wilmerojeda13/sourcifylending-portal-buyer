import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerNav from '@/components/dialer/DialerNav'
import CampaignDialerClient from './CampaignDialerClient'

export const metadata = { title: 'Queue — Dialer' }

export default async function DialerQueuePage({
  searchParams,
}: {
  searchParams: { campaign_id?: string }
}) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  const campaignId = searchParams.campaign_id
  if (!campaignId) redirect('/admin/dialer/campaigns')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <DialerNav />
      <CampaignDialerClient campaignId={campaignId} />
    </div>
  )
}
