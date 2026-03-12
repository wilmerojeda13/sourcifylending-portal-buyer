import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import OpportunitiesAdmin from './OpportunitiesAdmin'
import type { AccountOpportunity } from '@/types'

export default async function AdminOpportunitiesPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const { data: opportunities } = await supabase
    .from('account_opportunities')
    .select('*')
    .order('program')
    .order('priority_score', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Opportunities Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Add, edit, or disable funding opportunities shown to portal members.
            </p>
          </div>
          <a
            href="/admin/members"
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            ← Members
          </a>
        </div>

        <OpportunitiesAdmin
          initialOpportunities={(opportunities ?? []) as AccountOpportunity[]}
        />
      </div>
    </div>
  )
}
