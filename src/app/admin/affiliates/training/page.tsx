export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, PlayCircle } from 'lucide-react'
import AffiliateTrainingAdminClient from './AffiliateTrainingAdminClient'

export default async function AffiliateTrainingAdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const { data: videos } = await supabase
    .from('affiliate_training_videos')
    .select('*')
    .order('category')
    .order('sort_order')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/affiliates" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <PlayCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Affiliate Training Videos</h1>
              <p className="text-xs text-gray-500">Manage videos shown in the affiliate Training Center</p>
            </div>
          </div>
        </div>

        <AffiliateTrainingAdminClient initialVideos={videos ?? []} />
      </div>
    </div>
  )
}
