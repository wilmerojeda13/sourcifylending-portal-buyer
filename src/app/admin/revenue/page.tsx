import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import RevenueTrackerClient from './RevenueTrackerClient'

export default async function AdminRevenuePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  return <RevenueTrackerClient />
}
