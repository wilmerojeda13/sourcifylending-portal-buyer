import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  CRM_ANALYZER_EVENT_TYPES,
  type CrmAnalyzerEventType,
  recordAnalyzerSessionEvent,
} from '@/lib/crm-analyzer-sessions'

const PUBLIC_EVENTS = new Set<CrmAnalyzerEventType>([
  'link_opened',
  'analyzer_started',
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => ({})) as {
    event?: CrmAnalyzerEventType
    metadata?: Record<string, unknown>
  }
  const { id } = await params

  if (!body.event || !CRM_ANALYZER_EVENT_TYPES.includes(body.event) || !PUBLIC_EVENTS.has(body.event)) {
    return NextResponse.json({ error: 'Invalid analyzer session event' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const session = await recordAnalyzerSessionEvent({
    supabase,
    sessionId: id,
    eventType: body.event,
    metadata: body.metadata ?? {},
  })

  return NextResponse.json({ ok: true, session })
}
