import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import CRMParentNav from '@/components/crm/CRMParentNav'
import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import EmailCampaignDetailClient from './EmailCampaignDetailClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email Campaign — CRM' }

export default async function EmailCampaignDetailPage({ params }: { params: { id: string } }) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
          <CRMParentNav crumbs={[{ label: 'Admin Hub', href: '/admin' }, { label: 'Sales CRM', href: '/admin/crm' }, { label: 'Email Campaigns', href: '/admin/crm/email-campaigns' }, { label: 'Campaign' }]} />
          <CRMWorkspaceNav />
        </div>
      </div>
      <EmailCampaignDetailClient campaignId={params.id} />
    </div>
  )
}
