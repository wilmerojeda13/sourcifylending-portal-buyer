import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { promoteToCrm } from '@/lib/dialer-promotion'

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

  return { supabase, userId: user.id, userName: profile.full_name || profile.email || 'Admin' }
}

/**
 * POST /api/admin/crm/dialer/promote
 * Manual promotion of a raw dialer lead to CRM
 * Body: { raw_lead_id: string }
 */
export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const rawLeadId = body.raw_lead_id

  if (!rawLeadId) {
    return NextResponse.json({ error: 'raw_lead_id is required' }, { status: 400 })
  }

  try {
    const result = await promoteToCrm(admin.supabase, {
      rawLeadId,
      trigger: 'manual',
      userId: admin.userId,
    })

    return NextResponse.json({
      success: true,
      crm_lead_id: result.crmLeadId,
      merged: result.merged,
      already_promoted: result.alreadyPromoted,
      message: result.alreadyPromoted
        ? 'Lead was already promoted to CRM'
        : result.merged
        ? 'Lead merged with existing CRM contact'
        : 'Lead promoted to CRM successfully',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Promotion failed'
    console.error('[Dialer Promote] Failed:', { rawLeadId, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
