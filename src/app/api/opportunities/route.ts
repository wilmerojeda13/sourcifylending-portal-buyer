import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program, current_stage, subscription_status')
      .eq('id', user.id)
      .single()

    if (!profile?.assigned_program) {
      return NextResponse.json({ opportunities: [] })
    }

    // Fetch opportunities for this user's program (plus 'all') ordered by priority
    const { data: opportunities, error } = await supabase
      .from('account_opportunities')
      .select('*')
      .in('program', [profile.assigned_program, 'all'])
      .eq('is_active', true)
      .order('priority_score', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      opportunities: opportunities ?? [],
      assigned_program: profile.assigned_program,
      current_stage: profile.current_stage,
    })
  } catch (err) {
    console.error('Opportunities fetch error:', err)
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }
}
