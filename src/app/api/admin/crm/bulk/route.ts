import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const CHUNK_SIZE = 250

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

function chunkIds(ids: string[], size = CHUNK_SIZE) {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size))
  }
  return chunks
}

async function runChunkedMutation(
  ids: string[],
  mutate: (chunk: string[]) => Promise<{ error: { message: string } | null }>
) {
  const processedIds: string[] = []
  const failedIds: string[] = []
  const errors: string[] = []

  for (const chunk of chunkIds(ids)) {
    const { error } = await mutate(chunk)
    if (error) {
      failedIds.push(...chunk)
      errors.push(error.message)
    } else {
      processedIds.push(...chunk)
    }
  }

  return {
    processedIds,
    failedIds,
    failedCount: failedIds.length,
    errors,
    partial: failedIds.length > 0,
  }
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
    const result = await runChunkedMutation(ids, async (chunk) => {
      const { error } = await supabase
        .from('crm_leads')
        .delete()
        .in('id', chunk)
      return { error }
    })
    const message = result.partial
      ? `${result.processedIds.length} lead(s) deleted, ${result.failedCount} failed`
      : `${result.processedIds.length} lead(s) deleted`
    return NextResponse.json({ count: result.processedIds.length, message, ...result }, { status: result.partial ? 207 : 200 })
  }

  // ── Bulk update stage by IDs ──
  if (action === 'update_stage') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    if (!stage) {
      return NextResponse.json({ error: 'stage required' }, { status: 400 })
    }
    const updatedAt = new Date().toISOString()
    const result = await runChunkedMutation(ids, async (chunk) => {
      const { error } = await supabase
        .from('crm_leads')
        .update({ stage, updated_at: updatedAt })
        .in('id', chunk)
      return { error }
    })
    const message = result.partial
      ? `${result.processedIds.length} lead(s) moved to ${stage}, ${result.failedCount} failed`
      : `${result.processedIds.length} lead(s) moved to ${stage}`
    return NextResponse.json({ count: result.processedIds.length, message, ...result }, { status: result.partial ? 207 : 200 })
  }

  // ── Bulk archive by IDs ──
  if (action === 'archive_ids') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    const updatedAt = new Date().toISOString()
    const result = await runChunkedMutation(ids, async (chunk) => {
      const { error } = await supabase
        .from('crm_leads')
        .update({ is_archived: true, updated_at: updatedAt })
        .in('id', chunk)
      return { error }
    })
    const message = result.partial
      ? `${result.processedIds.length} lead(s) archived, ${result.failedCount} failed`
      : `${result.processedIds.length} lead(s) archived`
    return NextResponse.json({ count: result.processedIds.length, message, ...result }, { status: result.partial ? 207 : 200 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
