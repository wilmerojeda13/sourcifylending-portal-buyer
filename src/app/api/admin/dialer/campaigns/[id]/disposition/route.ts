import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

type CampaignLeadStatus =
  | 'new' | 'attempted' | 'contacted' | 'interested'
  | 'callback' | 'follow_up' | 'qualified'
  | 'promoted' | 'dnc' | 'closed_lost'

const OUTCOME_TO_STATUS: Record<string, CampaignLeadStatus> = {
  no_answer:      'attempted',
  voicemail:      'attempted',
  contacted:      'contacted',
  interested:     'interested',
  callback:       'callback',
  follow_up:      'follow_up',
  qualified:      'qualified',
  not_interested: 'closed_lost',
  dnc:            'dnc',
}

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase, userId: user.id }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    campaign_lead_id: string     // id from dialer_campaign_leads
    raw_lead_id:      string
    outcome:          string     // no_answer | voicemail | interested | callback | ...
    note?:            string | null
    callback_due_at?: string | null
    follow_up_at?:    string | null
    promote?:         boolean    // manually trigger CRM promotion
  }

  const { campaign_lead_id, raw_lead_id, outcome, note, callback_due_at, follow_up_at, promote } = body
  if (!campaign_lead_id || !raw_lead_id || !outcome) {
    return NextResponse.json({ error: 'campaign_lead_id, raw_lead_id, outcome required' }, { status: 400 })
  }

  const campaignId = params.id
  const now        = new Date().toISOString()
  const newStatus  = OUTCOME_TO_STATUS[outcome] ?? 'contacted'

  // 1. Update campaign lead record
  const { error: clErr } = await admin.supabase
    .from('dialer_campaign_leads')
    .update({
      status:            promote ? 'promoted' : newStatus,
      last_call_outcome: outcome,
      last_called_at:    now,
      callback_due_at:   callback_due_at ?? null,
      follow_up_at:      follow_up_at    ?? null,
      notes:             note            ?? null,
      updated_at:        now,
    })
    .eq('id', campaign_lead_id)
    .eq('campaign_id', campaignId)

  if (clErr) return NextResponse.json({ error: clErr.message }, { status: 500 })

  // 2. Mirror outcome onto raw lead
  const rawUpdate: Record<string, unknown> = {
    last_call_outcome: outcome,
    last_call_at:      now,
    updated_at:        now,
  }
  if (outcome === 'dnc') rawUpdate.do_not_call = true
  if (callback_due_at)   rawUpdate.callback_due_at = callback_due_at

  await admin.supabase
    .from('dialer_raw_leads')
    .update(rawUpdate)
    .eq('id', raw_lead_id)

  // 3. CRM promotion (qualified or explicit promote flag)
  let promotion: { crm_lead_id: string; merged: boolean } | null = null
  if (promote || outcome === 'qualified') {
    const { data: rawLead } = await admin.supabase
      .from('dialer_raw_leads')
      .select('*')
      .eq('id', raw_lead_id)
      .single()

    if (rawLead && !rawLead.promoted_to_crm_lead_id) {
      const { data: promoResult } = await admin.supabase.rpc('promote_raw_lead_to_crm', {
        p_raw_lead_id:   raw_lead_id,
        p_trigger:       promote ? 'manual' : outcome,
        p_user_id:       admin.userId,
        p_first_name:    rawLead.first_name,
        p_last_name:     rawLead.last_name,
        p_phone:         rawLead.phone,
        p_phone_e164:    rawLead.phone_e164,
        p_email:         rawLead.email,
        p_business_name: rawLead.business_name,
        p_notes:         rawLead.notes,
        p_source:        rawLead.source,
      })

      if (promoResult?.[0]) {
        promotion = { crm_lead_id: promoResult[0].crm_lead_id, merged: promoResult[0].merged }
        // Mark campaign lead promoted
        await admin.supabase
          .from('dialer_campaign_leads')
          .update({ status: 'promoted', updated_at: now })
          .eq('id', campaign_lead_id)
      }
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, promotion })
}
