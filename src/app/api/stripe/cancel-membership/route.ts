import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { applyMembershipChange } from '@/lib/membership-actions'

export async function POST(req: NextRequest) {
  try {
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { confirmText?: string }
    if (body.confirmText?.trim().toUpperCase() !== 'CANCEL MEMBERSHIP') {
      return NextResponse.json({ error: 'Confirmation text must be "CANCEL MEMBERSHIP"' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const result = await applyMembershipChange(supabase, context.activeBusinessId, 'cancel')

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Cancel membership error:', error)
    const message = error instanceof Error ? error.message : 'Cancellation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
