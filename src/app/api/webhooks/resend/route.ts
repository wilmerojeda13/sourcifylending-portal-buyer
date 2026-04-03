import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { CRM_INVITE_SOURCE, markCrmInviteEvent, type CrmInviteStatus } from '@/lib/crm-invites'

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getInviteIdFromPayload(payload: Record<string, unknown>) {
  const data = (payload.data ?? {}) as Record<string, unknown>
  const tags = Array.isArray(data.tags) ? data.tags : []
  const metadata = ((data.metadata ?? payload.metadata ?? {}) as Record<string, unknown>) ?? {}

  const tagInvite = tags.find((tag) => typeof tag === 'object' && tag && (tag as { name?: string }).name === 'invite_id') as { value?: string } | undefined
  return (
    getString(metadata.invite_id) ||
    getString(data.invite_id) ||
    getString(tagInvite?.value)
  )
}

function getEmailIdFromPayload(payload: Record<string, unknown>) {
  const data = (payload.data ?? {}) as Record<string, unknown>
  return getString(data.email_id) || getString(data.id) || getString(payload.email_id)
}

function getOccurredAt(payload: Record<string, unknown>) {
  const data = (payload.data ?? {}) as Record<string, unknown>
  return getString(data.created_at) || getString(payload.created_at) || new Date().toISOString()
}

function mapWebhookTypeToInviteStatus(rawType: string | null): CrmInviteStatus | null {
  if (!rawType) return null
  const type = rawType.toLowerCase()
  if (type.includes('delivered')) return 'delivered'
  if (type.includes('opened')) return 'opened'
  if (type.includes('clicked') || type.includes('click')) return 'clicked'
  return null
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const inviteId = getInviteIdFromPayload(payload)
  const status = mapWebhookTypeToInviteStatus(getString(payload.type))

  if (!inviteId || !status) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const supabase = await createServiceClient()
  await markCrmInviteEvent(supabase, {
    inviteId,
    status,
    resendEmailId: getEmailIdFromPayload(payload),
    occurredAt: getOccurredAt(payload),
    createdBy: CRM_INVITE_SOURCE,
    metadata: {
      webhook_type: getString(payload.type),
      webhook_payload: payload,
    },
  })

  return NextResponse.json({ ok: true })
}
