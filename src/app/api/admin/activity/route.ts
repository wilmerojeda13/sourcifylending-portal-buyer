import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null
  return user
}

// GET /api/admin/activity?category=&limit=
export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const supabase = await createServiceClient()

  let query = supabase
    .from('portal_events')
    .select(`
      id,
      user_id,
      event_type,
      event_category,
      title,
      message,
      metadata,
      severity,
      created_by,
      created_at,
      profiles (
        full_name,
        email,
        business_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category && category !== 'all') {
    query = query.eq('event_category', category)
  }

  const { data: events, error } = await query

  if (error) {
    console.error('[admin/activity] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }

  return NextResponse.json({ events: events ?? [] })
}
