import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
      campaign_id,
      campaign_lead_id,
      raw_lead_id,
      outcome,
      note,
      user_id,
      user_name,
    } = body

    // Validate required fields
    if (!campaign_id || !campaign_lead_id || !outcome) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, campaign_lead_id, outcome' },
        { status: 400 }
      )
    }

    // Insert analytics log - wrapped in try/catch to prevent disposition failures
    const { error: logError } = await admin.supabase
      .from('dialer_analytics_logs')
      .insert({
        campaign_id,
        campaign_lead_id,
        raw_lead_id: raw_lead_id || null,
        outcome,
        note: note || null,
        user_id: user_id || admin.userId,
        user_name: user_name || null,
        created_at: new Date().toISOString(),
      })

    // Log error but don't fail the request - disposition should still succeed
    if (logError) {
      console.error('Analytics log error (non-fatal):', logError)
    }

    return NextResponse.json({
      success: true,
      logged: !logError,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Analytics log exception (non-fatal):', message)
    // Return success even on error - don't block disposition
    return NextResponse.json({
      success: true,
      logged: false,
      error: message,
      timestamp: new Date().toISOString(),
    })
  }
}
