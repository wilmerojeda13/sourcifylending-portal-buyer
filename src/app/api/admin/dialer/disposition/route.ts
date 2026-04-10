import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
  return { supabase, userId: user.id, userName: (profile.full_name || profile.email || 'Admin') as string }
}

const STAGE_MAP: Record<string, string> = {
  no_answer:       'new',
  voicemail:       'contacted',
  left_voicemail:  'contacted',
  busy:            'contacted',
  contacted:       'contacted',
  interested:      'interested',
  callback:        'callback',
  call_back:       'callback',
  call_back_later: 'callback',
  follow_up:       'follow_up',
  qualified:       'qualified',
  appointment_set: 'qualified',
  booked_call:     'qualified',
  not_interested:  'closed_lost',
  bad_number:      'closed_lost',
  wrong_number:    'closed_lost',
  closed_lost:     'closed_lost',
  dnc:             'dnc',
}

const AUTO_PROMOTE = new Set(['appointment_set', 'booked_call'])

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    raw_lead_id: string
    disposition_key: string
    call_id?: string | null
    note?: string | null
    follow_up_at?: string | null
    lead_temperature?: 'cold' | 'warm' | 'hot' | null
  }

  if (!body.raw_lead_id || !body.disposition_key) {
    return NextResponse.json({ error: 'raw_lead_id and disposition_key are required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const newStage = STAGE_MAP[body.disposition_key]

  const updates: Record<string, unknown> = {
    last_call_outcome: body.disposition_key,
    last_call_at: now,
    updated_at: now,
  }

  if (newStage) updates.stage = newStage

  if (body.disposition_key === 'dnc') {
    updates.do_not_call = true
    updates.is_archived = true
  }
  if (body.disposition_key === 'bad_number' || body.disposition_key === 'wrong_number') {
    updates.is_archived = true
  }

  if (body.follow_up_at) {
    const isCallback = ['callback', 'call_back', 'call_back_later'].includes(body.disposition_key)
    if (isCallback) {
      updates.callback_due_at = body.follow_up_at
    } else {
      updates.follow_up_at = body.follow_up_at
    }
  }

  const { data: updatedLead, error } = await admin.supabase
    .from('dialer_raw_leads')
    .update(updates)
    .eq('id', body.raw_lead_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.call_id) {
    await admin.supabase
      .from('crm_calls')
      .update({
        call_outcome: body.disposition_key,
        call_status: 'completed',
        notes: body.note ?? null,
        next_follow_up_at: body.follow_up_at ?? null,
        lead_temperature: body.lead_temperature ?? 'cold',
        call_ended_at: now,
        updated_at: now,
      })
      .eq('id', body.call_id)
  }

  let promotionResult = null
  if (AUTO_PROMOTE.has(body.disposition_key) && !updatedLead.promoted_to_crm_lead_id) {
    const { data: promoted } = await admin.supabase.rpc('promote_raw_lead_to_crm', {
      p_raw_lead_id:    body.raw_lead_id,
      p_trigger:        body.disposition_key,
      p_user_id:        admin.userId,
      p_first_name:     updatedLead.first_name,
      p_last_name:      updatedLead.last_name ?? '',
      p_phone:          updatedLead.phone,
      p_phone_e164:     updatedLead.phone_e164 ?? null,
      p_email:          updatedLead.email ?? null,
      p_business_name:  updatedLead.business_name ?? null,
      p_notes:          updatedLead.notes ?? null,
      p_source:         updatedLead.source ?? 'dialer_promoted',
    })
    promotionResult = promoted?.[0] ?? null
    if (promotionResult) {
      await admin.supabase
        .from('dialer_raw_leads')
        .update({ stage: 'promoted', updated_at: now })
        .eq('id', body.raw_lead_id)
    }
  }

  return NextResponse.json({ ok: true, raw_lead: updatedLead, new_stage: newStage, promotion: promotionResult })
}
