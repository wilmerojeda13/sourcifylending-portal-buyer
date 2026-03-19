import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ memberships: memberships ?? [] })
  } catch (error) {
    console.error('GET /api/memberships error:', error)
    return NextResponse.json({ error: 'Failed to fetch memberships' }, { status: 500 })
  }
}
