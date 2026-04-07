import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import AdminAIPanel from '@/components/ai/AdminAIPanel'
import AdminNotificationBell from '@/components/admin/AdminNotificationBell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <>
      <div id="admin-shell-floaters">
        <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
          {/* AdminNotificationBell removed */}
        </div>
        <AdminAIPanel />
      </div>
      {children}
    </>
  )
}
