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
      {/* Notification bell — fixed top-right, visible on all admin pages */}
      <div className="fixed top-4 right-4 z-40">
        <AdminNotificationBell />
      </div>
      {children}
      <AdminAIPanel />
    </>
  )
}
