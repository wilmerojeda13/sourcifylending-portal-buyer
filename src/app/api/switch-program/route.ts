import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program_code } = await req.json()
    if (!program_code) return NextResponse.json({ error: 'program_code required' }, { status: 400 })

    // Verify the user actually has an active membership for this program
    const { data: membership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('program_code', program_code)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No active membership for this program' }, { status: 403 })
    }

    // Switch assigned_program to the requested program
    const { error } = await supabase
      .from('profiles')
      .update({ assigned_program: program_code, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, program_code })
  } catch (err) {
    console.error('[switch-program]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
