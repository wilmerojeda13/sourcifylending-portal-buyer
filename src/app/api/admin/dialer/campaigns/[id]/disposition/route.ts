import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { promoteToCrm } from '@/lib/dialer-promotion'

const CAMPAIGN_OUTCOME_TO_CRM_STAGE: Record<string, string> = {
  qualified:       'qualified',
  appointment_set: 'demo_scheduled',
  booked_call:     'demo_scheduled',
}

type CampaignLeadStatus =
  | 'new' | 'attempted' | 'contacted' | 'interested'
  | 'callback' | 'follow_up' | 'qualified'
  | 'promoted' | 'dnc' | 'closed_lost'

type PromotionOutcome =
  | 'created_new_crm_lead'
  | 'merged_into_existing_crm_lead'
  | 'already_promoted'
  | 'promotion_failed'

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
    client_timestamp?: string   // browser local time for timezone sync
  }

  const { campaign_lead_id, raw_lead_id, outcome, note, callback_due_at, follow_up_at, promote } = body
  if (!campaign_lead_id || !raw_lead_id || !outcome) {
    return NextResponse.json({ error: 'campaign_lead_id, raw_lead_id, outcome required' }, { status: 400 })
  }

  const campaignId = params.id
  // Use client timestamp if provided, otherwise use server time
  const now = body.client_timestamp || new Date().toISOString()
  const newStatus  = OUTCOME_TO_STATUS[outcome] ?? 'contacted'

  // 1. Update campaign lead record
  const { error: clErr } = await admin.supabase
    .from('dialer_campaign_leads')
    .update({
      status:            newStatus,
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

  // 1b. Increment call_count on both tables atomically (every call attempt, any outcome)
  try {
    await admin.supabase.rpc('increment_call_counts', {
      p_campaign_lead_id: campaign_lead_id,
      p_raw_lead_id:      raw_lead_id,
    })
  } catch (cntErr) {
    console.error('[Campaign Disposition] call_count increment failed (non-fatal):', cntErr)
  }

  // 2. Mirror outcome onto raw lead
  const rawUpdate: Record<string, unknown> = {
    last_call_outcome: outcome,
    last_call_at:      now,
    updated_at:        now,
  }
  if (outcome === 'dnc') {
    rawUpdate.do_not_call = true
    rawUpdate.stage       = 'dnc'
  }
  if (callback_due_at) rawUpdate.callback_due_at = callback_due_at

  const { error: rawErr } = await admin.supabase
    .from('dialer_raw_leads')
    .update(rawUpdate)
    .eq('id', raw_lead_id)

  // DNC writes must succeed — a silent failure would leave the lead dialable
  if (rawErr && outcome === 'dnc') {
    console.error('[Campaign Disposition] DNC raw-lead update failed:', rawErr.message)
    return NextResponse.json(
      { error: `DNC update failed: ${rawErr.message}` },
      { status: 500 },
    )
  }
  if (rawErr) {
    console.error('[Campaign Disposition] Raw-lead update failed (non-fatal):', rawErr.message)
  }

  // 3. Log analytics (wrapped in try/catch - non-fatal to disposition)
  try {
    await admin.supabase.from('dialer_analytics_logs').insert({
      campaign_id: campaignId,
      campaign_lead_id,
      raw_lead_id,
      outcome,
      note: note || null,
      user_id: admin.userId,
      created_at: now,
    })
  } catch (analyticsErr) {
    console.error('[Campaign Disposition] Analytics log failed (non-fatal):', analyticsErr)
  }

  // 4. CRM promotion (qualified or explicit promote flag)
  let promotion:
    | {
        outcome: PromotionOutcome
        crm_lead_id: string
        merged: boolean
        alreadyPromoted: boolean
      }
    | null = null
  if (promote || outcome === 'qualified') {
    const { data: rawLead } = await admin.supabase
      .from('dialer_raw_leads')
      .select('*')
      .eq('id', raw_lead_id)
      .single()

    if (!rawLead) {
      return NextResponse.json(
        {
          error: `Dialer raw lead not found: ${raw_lead_id}`,
          promotion: { outcome: 'promotion_failed' satisfies PromotionOutcome },
        },
        { status: 404 },
      )
    }

    try {
      const result = await promoteToCrm(admin.supabase, {
        rawLeadId: raw_lead_id,
        trigger:   promote ? 'manual' : outcome,
        userId:    admin.userId,
        workflowState: {
          callback_due_at:   callback_due_at ?? null,
          follow_up_at:      follow_up_at    ?? null,
          last_call_outcome: outcome,
          last_call_at:      now,
          last_call_note:    note ?? null,
          crm_stage:         CAMPAIGN_OUTCOME_TO_CRM_STAGE[outcome] ?? null,
        },
      })

      const outcomeLabel: PromotionOutcome = result.alreadyPromoted
        ? 'already_promoted'
        : result.merged
          ? 'merged_into_existing_crm_lead'
          : 'created_new_crm_lead'

      promotion = {
        outcome: outcomeLabel,
        crm_lead_id: result.crmLeadId,
        merged: result.merged,
        alreadyPromoted: result.alreadyPromoted,
      }

      const { error: promotedErr } = await admin.supabase
        .from('dialer_campaign_leads')
        .update({ status: 'promoted', updated_at: now })
        .eq('id', campaign_lead_id)
        .eq('campaign_id', campaignId)

      if (promotedErr) {
        console.error('[Campaign Disposition] Campaign lead promotion status update failed:', promotedErr)
      }
    } catch (err) {
      console.error('[Campaign Disposition] Promotion failed:', err)
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : 'CRM promotion failed',
          promotion: { outcome: 'promotion_failed' satisfies PromotionOutcome },
        },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, promotion })
}
