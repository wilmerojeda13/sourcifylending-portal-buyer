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

  const body = await req.json()
  const { action, filter, ids, stage } = body

  // ── Archive by filter ──
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

  // ── Delete all archived ──
  if (action === 'delete_archived') {
    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .eq('is_archived', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: '✓', message: 'archived leads permanently deleted' })
  }

  // ── Bulk delete by IDs ──
  if (action === 'delete_ids') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Max 500 leads per batch' }, { status: 400 })
    }
    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: ids.length, message: `${ids.length} lead(s) deleted` })
  }

  // ── Bulk update stage by IDs ──
  if (action === 'update_stage') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (!stage) {
      return NextResponse.json({ error: 'stage required' }, { status: 400 })
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Max 500 leads per batch' }, { status: 400 })
    }
    const { error } = await supabase
      .from('crm_leads')
      .update({ stage, updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: ids.length, message: `${ids.length} lead(s) moved to ${stage}` })
  }

  // ── Bulk archive by IDs ──
  if (action === 'archive_ids') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Max 500 leads per batch' }, { status: 400 })
    }
    const { error } = await supabase
      .from('crm_leads')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: ids.length, message: `${ids.length} lead(s) archived` })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
