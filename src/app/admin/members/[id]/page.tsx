import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MemberDetail from './MemberDetail'
import Link from 'next/link'

export default async function AdminMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [
    { data: profile },
    { data: subscription },
    { data: tasks },
    { data: documents },
    { data: activityLogs },
    { data: contactNotes },
    { data: tickets },
    { data: memberships },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('subscriptions').select('*').eq('user_id', id).single(),
    supabase.from('tasks').select('*').eq('user_id', id).order('sort_order'),
    supabase.from('documents').select('*').eq('user_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('activity_logs').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(25),
    supabase.from('contact_notes').select('*').eq('user_id', id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('tickets').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('memberships').select('program_code').eq('user_id', id).eq('status', 'active'),
  ])

  // Attach active_programs to profile so MemberDetail can initialize checkbox state
  const activePrograms = (memberships ?? []).map((m: { program_code: string }) => m.program_code)

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Member not found.</p>
          <Link href="/admin/members" className="text-green-600 hover:underline text-sm">← Back to Members</Link>
        </div>
      </div>
    )
  }

  return (
    <MemberDetail
      profile={{ ...profile, active_programs: activePrograms }}
      subscription={subscription ?? null}
      tasks={tasks ?? []}
      documents={documents ?? []}
      activityLogs={activityLogs ?? []}
      contactNotes={contactNotes ?? []}
      tickets={tickets ?? []}
    />
  )
}
