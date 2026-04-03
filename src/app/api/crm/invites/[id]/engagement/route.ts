import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { CRM_INVITE_SOURCE, markCrmInviteEvent, type CrmInviteStatus } from '@/lib/crm-invites'

const ALLOWED_EVENTS: CrmInviteStatus[] = ['clicked', 'analyzer_started', 'analyzer_submitted']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => ({})) as { event?: CrmInviteStatus; metadata?: Record<string, unknown> }
  const { id } = await params

  if (!body.event || !ALLOWED_EVENTS.includes(body.event)) {
    return NextResponse.json({ error: 'Invalid engagement event' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const result = await markCrmInviteEvent(supabase, {
    inviteId: id,
    status: body.event,
    createdBy: CRM_INVITE_SOURCE,
    metadata: {
      source: CRM_INVITE_SOURCE,
      ...(body.metadata ?? {}),
    },
  })

  return NextResponse.json({ ok: Boolean(result.invite) })
}
