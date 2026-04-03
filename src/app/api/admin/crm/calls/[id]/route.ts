import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CRM_CALL_OUTCOMES, CRM_CALL_STATUSES, CRM_LEAD_TEMPERATURES } from '@/lib/crm'
import { getRelationUnavailableMessage, isMissingRelationError } from '@/lib/supabase-schema'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? supabase : null
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('crm_calls')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, 'crm_calls')) {
      console.error('crm_calls unavailable in GET /api/admin/crm/calls/[id]', error)
      return NextResponse.json({ error: getRelationUnavailableMessage('CRM call logging') }, { status: 503 })
    }
    return NextResponse.json({ error: 'Unable to load this call right now.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  return NextResponse.json({ call: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const allowed = [
    'lead_name',
    'company_name',
    'phone_number',
    'rep_phone_number',
    'from_number',
    'to_number_e164',
    'call_started_at',
    'call_ended_at',
    'duration_seconds',
    'call_status',
    'call_outcome',
    'call_provider',
    'twilio_status',
    'twilio_call_sid',
    'twilio_agent_call_sid',
    'answered_by',
    'amd_status',
    'notes',
    'next_follow_up_at',
    'lead_temperature',
    'strategy_call_booked',
    'converted_to_client',
    'booked_event_id',
    'booked_event_source',
    'source',
    'metadata',
  ]

  if (body.call_outcome && !CRM_CALL_OUTCOMES.includes(body.call_outcome)) {
    return NextResponse.json({ error: 'Invalid call outcome' }, { status: 400 })
  }
  if (body.call_status && !CRM_CALL_STATUSES.includes(body.call_status)) {
    return NextResponse.json({ error: 'Invalid call status' }, { status: 400 })
  }
  if (body.lead_temperature && !CRM_LEAD_TEMPERATURES.includes(body.lead_temperature)) {
    return NextResponse.json({ error: 'Invalid lead temperature' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('crm_calls')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (isMissingRelationError(error, 'crm_calls')) {
      console.error('crm_calls unavailable in PATCH /api/admin/crm/calls/[id]', error)
      return NextResponse.json({ error: getRelationUnavailableMessage('CRM call logging') }, { status: 503 })
    }
    return NextResponse.json({ error: 'Unable to update this call right now.' }, { status: 500 })
  }
  return NextResponse.json({ call: data })
}
