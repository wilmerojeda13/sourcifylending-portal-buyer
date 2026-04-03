import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchContentSnapshot } from '@/lib/content-engine'
import ContentEngineClient from './ContentEngineClient'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const snapshot = await fetchContentSnapshot()

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Content OS</h1>
            <p className="mt-1 text-sm text-gray-500">
              SEO + AI-search workspace for drafting, refreshing, indexing, and attribution.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex w-fit text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
          >
            ← Admin Hub
          </Link>
        </div>

        <ContentEngineClient initialSnapshot={snapshot} />
      </div>
    </div>
  )
}
