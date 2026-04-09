import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyCrmDisposition, type CRMDispositionKey } from '@/lib/crm-dispositions'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
  }
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.lead_id || !body.disposition_key) {
    return NextResponse.json({ error: 'lead_id and disposition_key are required.' }, { status: 400 })
  }

  try {
    const result = await applyCrmDisposition(admin.supabase, {
      leadId: body.lead_id,
      dispositionKey: body.disposition_key as CRMDispositionKey,
      note: body.note ?? null,
      followUpAt: body.follow_up_at ?? null,
      callId: body.call_id ?? null,
      leadTemperature: body.lead_temperature ?? null,
      strategyCallBooked: Boolean(body.strategy_call_booked),
      convertedToClient: Boolean(body.converted_to_client),
      actorUserId: admin.userId,
      actorName: admin.userName,
      createFollowUpTask: body.create_follow_up_task !== false,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save disposition.' },
      { status: 400 },
    )
  }
}
