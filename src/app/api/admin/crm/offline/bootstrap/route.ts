import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
    email: profile.email || user.email || null,
  }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [leadsResult, tasksResult, callsResult] = await Promise.all([
    admin.supabase
      .from('crm_leads')
      .select('*')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(5000),
    admin.supabase
      .from('crm_tasks')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5000),
    admin.supabase
      .from('crm_calls')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(2000),
  ])

  if (leadsResult.error) return NextResponse.json({ error: leadsResult.error.message }, { status: 500 })
  if (tasksResult.error) return NextResponse.json({ error: tasksResult.error.message }, { status: 500 })

  return NextResponse.json({
    leads: (leadsResult.data ?? []).map((lead) => ({
      ...lead,
      tags: Array.isArray(lead.tags) ? lead.tags : [],
      pending_sync: false,
      sync_state: 'synced',
      local_updated_at: lead.updated_at,
      server_updated_at: lead.updated_at,
      last_synced_at: new Date().toISOString(),
      conflict_note: null,
    })),
    tasks: (tasksResult.data ?? []).map((task) => ({
      ...task,
      pending_sync: false,
      sync_state: 'synced',
      local_updated_at: task.updated_at,
      server_updated_at: task.updated_at,
      last_synced_at: new Date().toISOString(),
      conflict_note: null,
    })),
    calls: ((callsResult.data ?? []) as Record<string, unknown>[]).map((call) => ({
      ...call,
      pending_sync: false,
      sync_state: 'synced',
      local_updated_at: String(call.updated_at ?? call.call_started_at ?? new Date().toISOString()),
      server_updated_at: String(call.updated_at ?? call.call_started_at ?? new Date().toISOString()),
      last_synced_at: new Date().toISOString(),
      conflict_note: null,
    })),
    user: {
      id: admin.userId,
      name: admin.userName,
      email: admin.email,
    },
    generated_at: new Date().toISOString(),
  })
}
