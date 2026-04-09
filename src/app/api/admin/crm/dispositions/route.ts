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

  console.log('[Disposition API] Saving disposition:', {
    lead_id: body.lead_id,
    disposition_key: body.disposition_key,
    has_note: Boolean(body.note),
    has_follow_up: Boolean(body.follow_up_at),
    has_call_id: Boolean(body.call_id),
  })

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

    console.log('[Disposition API] Disposition saved successfully:', {
      lead_id: body.lead_id,
      disposition: result.disposition.label,
      warnings: result.warnings,
    })

    // If there are warnings, include them in the response
    if (result.warnings.length > 0) {
      return NextResponse.json({
        ...result,
        degraded: true,
        message: 'Disposition saved, but some tracking features are not available yet.',
      }, { status: 202 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save disposition.'
    console.error('[Disposition API] Failed to save disposition:', {
      lead_id: body.lead_id,
      disposition_key: body.disposition_key,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 },
    )
  }
}
