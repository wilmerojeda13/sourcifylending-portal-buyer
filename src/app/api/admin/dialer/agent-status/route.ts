import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Get count of high priority leads
    const { count: priorityCount, error: countError } = await supabase
      .from('dialer_raw_leads')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'high_priority')
      .eq('is_archived', false)

    if (countError) {
      console.error('[Agent Status] Count error:', countError)
    }

    // Get last agent activity from audit logs
    const { data: lastActivity } = await supabase
      .from('crm_audit_logs')
      .select('created_at, details')
      .or('action_type.eq.stage_updated,action_type.eq.tag_assigned,action_type.eq.task_created')
      .eq('details->>source', 'lead-processor-agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Determine status based on last activity (within last hour = active)
    const now = new Date()
    const lastScrub = lastActivity?.created_at
      ? new Date(lastActivity.created_at)
      : null
    const isActive = lastScrub
      ? (now.getTime() - lastScrub.getTime()) < 60 * 60 * 1000 // 1 hour
      : false

    return NextResponse.json({
      status: isActive ? 'active' : 'paused',
      lastScrub: lastScrub?.toISOString() ?? null,
      totalPriorityLeads: priorityCount ?? 0,
    })
  } catch (err) {
    console.error('[Agent Status] Error:', err)
    return NextResponse.json(
      { status: 'error', lastScrub: null, totalPriorityLeads: 0 },
      { status: 500 }
    )
  }
}
