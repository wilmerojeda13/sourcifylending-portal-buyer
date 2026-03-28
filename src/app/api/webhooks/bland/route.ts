import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Map Bland outcome → CRM stage
function mapOutcome(answeredBy: string, disposition?: string): string {
  if (answeredBy === 'no-answer') return 'contacted'
  if (answeredBy === 'voicemail') return 'contacted'
  if (answeredBy === 'human') {
    const d = (disposition ?? '').toLowerCase()
    if (d.includes('interested') || d.includes('qualified')) return 'qualified'
    if (d.includes('demo') || d.includes('book')) return 'demo_scheduled'
    if (d.includes('not_interested') || d.includes('not interested') || d.includes('no')) return 'closed_lost'
    return 'contacted'
  }
  return 'contacted'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      call_id,
      batch_id,
      to,
      answered_by,
      call_length,
      summary,
      variables,
    } = body

    if (!to) return NextResponse.json({ ok: true }) // ignore malformed

    // Normalize phone
    const digits = String(to).replace(/\D/g, '')
    const phone =
      digits.length === 10
        ? `+1${digits}`
        : digits.startsWith('1') && digits.length === 11
        ? `+${digits}`
        : to

    const supabase = await createServiceClient()

    // Find lead by phone
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, stage')
      .eq('phone', phone)
      .single()

    if (!lead) return NextResponse.json({ ok: true, note: 'Lead not found' })

    const newStage = mapOutcome(answered_by ?? 'unknown', variables?.disposition)
    const now = new Date().toISOString()

    // Update lead
    await supabase.from('crm_leads').update({
      stage: newStage,
      last_contacted_at: now,
      updated_at: now,
    }).eq('id', lead.id)

    // Log activity
    const activityBody = [
      answered_by === 'no-answer'
        ? 'No Answer (AI Campaign)'
        : answered_by === 'voicemail'
        ? 'Voicemail Left (AI Campaign)'
        : 'AI Call Completed',
      summary ? `Summary: ${summary}` : null,
      call_length ? `Duration: ${Math.round(call_length * 60)}s` : null,
    ]
      .filter(Boolean)
      .join('\n')

    await supabase.from('crm_activities').insert({
      lead_id: lead.id,
      type: answered_by === 'voicemail' ? 'voicemail' : 'call',
      body: activityBody,
      metadata: { source: 'bland_ai', call_id, batch_id, answered_by, call_length },
      created_at: now,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Bland webhook error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Bland
  }
}
