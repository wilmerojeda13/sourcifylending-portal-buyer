import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { TicketStatus, TicketPriority } from '@/types'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return { user: null, supabase: null }
  return { user, supabase }
}

// GET /api/admin/tickets?user_id=xxx — list tickets for a member
export async function GET(req: NextRequest) {
  const { supabase } = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data ?? [] })
}

// POST /api/admin/tickets — create a ticket
export async function POST(req: NextRequest) {
  const { user, supabase } = await requireAdmin()
  if (!supabase || !user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    user_id: string
    title: string
    description?: string
    priority?: TicketPriority
    category?: string
  }

  const { user_id, title, description, priority, category } = body
  if (!user_id || !title?.trim()) {
    return NextResponse.json({ error: 'user_id and title are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      user_id,
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority || 'normal',
      category: category || 'general',
      status: 'open',
      created_by_email: user.email,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data }, { status: 201 })
}

// PATCH /api/admin/tickets — update a ticket (status, resolution, priority, etc.)
export async function PATCH(req: NextRequest) {
  const { supabase } = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    id: string
    status?: TicketStatus
    priority?: TicketPriority
    title?: string
    description?: string
    category?: string
    resolution?: string
  }

  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tickets')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data })
}

// DELETE /api/admin/tickets?id=ticketId — delete a ticket
export async function DELETE(req: NextRequest) {
  const { supabase } = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
