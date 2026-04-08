import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { inferLeadPhoneIntelligence } from '@/lib/crm-call-compliance'
import { getLatestLeadAnalyzerSession, recordAnalyzerSessionEvent } from '@/lib/crm-analyzer-sessions'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

function isMissingLeadTimezoneColumn(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === '42703' || error?.message?.includes('crm_leads.phone_e164 does not exist') || false
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('crm_leads').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const allowed = [
    'first_name','last_name','phone','email','business_name',
    'stage','program_interest','source','notes','follow_up_at',
    'do_not_call','is_archived','last_contacted_at',
    'lead_temperature','strategy_call_booked','converted_to_client',
    'close_probability','last_call_outcome','last_call_at',
    'callback_due_at','latest_call_note','deal_value',
    'tags',
    'assigned_to_user_id','assigned_to_name',
    'acquisition_path','assigned_partner_affiliate_id','assigned_partner_name',
    'partner_relationship_started_at','partner_onboarding_status','delegate_access_authorized',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if ('phone' in body) {
    const phoneIntelligence = await inferLeadPhoneIntelligence(body.phone)
    update.phone_e164 = phoneIntelligence.phone_e164
    update.likely_timezone = phoneIntelligence.likely_timezone
    update.timezone_confidence = phoneIntelligence.timezone_confidence
    update.timezone_source = phoneIntelligence.timezone_source
    update.last_timezone_checked_at = phoneIntelligence.last_timezone_checked_at
  }

  let { data, error } = await supabase
    .from('crm_leads')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (isMissingLeadTimezoneColumn(error)) {
    const retryUpdate = { ...update }
    delete retryUpdate.phone_e164
    delete retryUpdate.likely_timezone
    delete retryUpdate.timezone_confidence
    delete retryUpdate.timezone_source
    delete retryUpdate.last_timezone_checked_at

    ;({ data, error } = await supabase
      .from('crm_leads')
      .update(retryUpdate)
      .eq('id', id)
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log stage changes to activity feed
  if ('stage' in body && body.stage) {
    const leadName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email || 'Unknown'
    logPortalEvent({
      eventType: 'crm_lead_stage_changed',
      category: 'leads',
      title: `Lead Moved: ${leadName}`,
      message: `Stage updated to "${body.stage}".`,
      metadata: {
        lead_id: id,
        stage: body.stage,
        ...(data.email ? { email: data.email } : {}),
        ...(data.business_name ? { business: data.business_name } : {}),
      },
      severity: 'info',
    }).catch(() => {})
  }

  if ('converted_to_client' in body && body.converted_to_client) {
    try {
      const latestSession = await getLatestLeadAnalyzerSession(supabase, id)
      if (latestSession) {
        await recordAnalyzerSessionEvent({
          supabase,
          sessionId: latestSession.id,
          eventType: 'converted',
          metadata: {
            lead_id: id,
            source: 'crm_lead_patch',
          },
        })
      }
    } catch (error) {
      console.error('[crm lead route] failed to record converted analyzer event', error)
    }
  }

  return NextResponse.json({ lead: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { error } = await supabase.from('crm_leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
