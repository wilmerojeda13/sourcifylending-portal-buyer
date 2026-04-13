import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { recordCallLog } from '@/lib/call-logs'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

// POST: Log a dial/analytics event
export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      call_log_id,
      campaign_id,
      campaign_lead_id,
      raw_lead_id,
      outcome,
      duration_seconds,
      timestamp,
      lead_source,
      user_id,
    } = body

    // Validate required fields
    if (!campaign_id || !campaign_lead_id || !outcome) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, campaign_lead_id, outcome' },
        { status: 400 }
      )
    }

    await recordCallLog(admin.supabase, {
      id: call_log_id ?? crypto.randomUUID(),
      leadId: raw_lead_id || campaign_lead_id,
      rawLeadId: raw_lead_id || null,
      campaignId: campaign_id,
      campaignLeadId: campaign_lead_id,
      repUserId: user_id || admin.userId,
      sourceSystem: 'dialer',
      timestamp: timestamp ?? new Date().toISOString(),
      durationSeconds: duration_seconds ?? 0,
      disposition: outcome,
      leadSource: lead_source ?? null,
    })

    return NextResponse.json({
      success: true,
      logged: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Analytics log exception:', message)
    return NextResponse.json({
      success: false,
      logged: false,
      error: message,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
