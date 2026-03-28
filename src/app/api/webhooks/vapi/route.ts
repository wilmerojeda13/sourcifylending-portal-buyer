import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Normalize a phone number to E.164 format
function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  return raw
}

// Map VAPI endedReason + successEvaluation → CRM stage
function mapOutcome(
  endedReason: string,
  successEvaluation?: string
): { stage: string | null; activityType: string; activityLabel: string } {
  switch (endedReason) {
    case 'customer-did-not-answer':
    case 'customer-busy':
      // Stage stays the same — just log activity
      return { stage: null, activityType: 'call', activityLabel: 'No Answer (AI Campaign)' }

    case 'voicemail':
      return { stage: 'contacted', activityType: 'voicemail', activityLabel: 'Voicemail Left (AI Campaign)' }

    case 'customer-ended-call':
    case 'assistant-ended-call': {
      const eval_ = (successEvaluation ?? '').toLowerCase()
      if (eval_ === 'true') {
        return { stage: 'qualified', activityType: 'call', activityLabel: 'AI Call — Qualified' }
      }
      if (eval_ === 'false') {
        return { stage: 'closed_lost', activityType: 'call', activityLabel: 'AI Call — Not Interested' }
      }
      return { stage: 'contacted', activityType: 'call', activityLabel: 'AI Call Completed' }
    }

    case 'exceeded-max-duration':
      return { stage: 'contacted', activityType: 'call', activityLabel: 'AI Call — Max Duration Reached' }

    default:
      return { stage: null, activityType: 'call', activityLabel: 'AI Call (Unknown Outcome)' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const message = body?.message
    if (!message || message.type !== 'end-of-call-report') {
      // Not a call report — acknowledge and ignore
      return NextResponse.json({ ok: true })
    }

    const call = message.call ?? {}
    const rawPhone = call?.customer?.number
    if (!rawPhone) return NextResponse.json({ ok: true })

    const phone = normalizePhone(rawPhone)
    const transcript: string | undefined = message.transcript
    const summary: string | undefined = message.summary
    const endedReason: string = message.endedReason ?? call.endedReason ?? 'unknown'
    const successEvaluation: string | undefined = message.analysis?.successEvaluation

    const supabase = await createServiceClient()

    // Find lead by phone
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, stage')
      .eq('phone', phone)
      .single()

    if (!lead) return NextResponse.json({ ok: true, note: 'Lead not found' })

    const { stage: newStage, activityType, activityLabel } = mapOutcome(endedReason, successEvaluation)
    const now = new Date().toISOString()

    // Update lead stage and last_contacted_at
    const updatePayload: Record<string, string> = { last_contacted_at: now, updated_at: now }
    if (newStage) updatePayload.stage = newStage

    await supabase.from('crm_leads').update(updatePayload).eq('id', lead.id)

    // Build activity body
    const bodyParts: string[] = [activityLabel]
    if (summary) bodyParts.push(`Summary: ${summary}`)
    if (transcript) bodyParts.push(`Transcript: ${transcript.slice(0, 500)}${transcript.length > 500 ? '…' : ''}`)
    const activityBody = bodyParts.join('\n\n')

    // Insert activity log
    await supabase.from('crm_activities').insert({
      lead_id: lead.id,
      type: activityType,
      body: activityBody,
      metadata: {
        source: 'vapi',
        call_id: call.id,
        ended_reason: endedReason,
        success_evaluation: successEvaluation,
        status: call.status,
      },
      created_at: now,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('VAPI webhook error:', err)
    // Always return 200 so VAPI does not retry
    return NextResponse.json({ ok: true })
  }
}
