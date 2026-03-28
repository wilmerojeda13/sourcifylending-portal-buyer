import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, filter } = await req.json()

  if (action === 'archive') {
    let query = supabase
      .from('crm_leads')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('is_archived', false)

    if (filter === 'closed_lost') query = query.eq('stage', 'closed_lost')
    else if (filter === 'dnc') query = query.eq('do_not_call', true)
    else return NextResponse.json({ error: 'Unknown filter' }, { status: 400 })

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: '✓', message: 'archived — refresh to see updated count' })
  }

  if (action === 'delete_archived') {
    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .eq('is_archived', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: '✓', message: 'archived leads permanently deleted' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
