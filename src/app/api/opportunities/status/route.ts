import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['applied', 'approved', 'denied', 'pending']

// POST — upsert a status for an opportunity
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { opportunity_id, status } = body

    if (!opportunity_id) {
      return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 })
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const { error } = await supabase
      .from('opportunity_user_status')
      .upsert(
        {
          user_id: user.id,
          opportunity_id,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,opportunity_id' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('[opportunities/status POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE — remove a user's status for an opportunity (undo)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { opportunity_id } = body

    if (!opportunity_id) {
      return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 })
    }

    await supabase
      .from('opportunity_user_status')
      .delete()
      .eq('user_id', user.id)
      .eq('opportunity_id', opportunity_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[opportunities/status DELETE]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
