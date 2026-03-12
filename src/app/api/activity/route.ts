import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import type { ActivityEventType } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { event_type, event_data } = await req.json() as {
      event_type: ActivityEventType
      event_data?: Record<string, unknown>
    }

    const validEvents: ActivityEventType[] = [
      'signup', 'login', 'analyzer_completed', 'agreement_accepted',
      'checkout_started', 'checkout_completed', 'subscription_reactivated',
      'subscription_canceled', 'payment_failed', 'task_completed',
      'document_uploaded', 'report_generated', 'portal_accessed',
    ]

    if (!validEvents.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    await logActivity(user.id, event_type, event_data, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Activity route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
