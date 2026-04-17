import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendDemoBookingEmail, type DemoBookingEmailStage } from '@/lib/email'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const lookAheadIso = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString()

  const { data: sequences, error } = await supabase
    .from('demo_booking_sequences')
    .select(`
      id, sequence_key, lead_email, lead_first_name, lead_last_name, business_name,
      appointment_datetime, timezone, reminder_24h_sent_at, reminder_3h_sent_at,
      reminder_10m_sent_at, canceled_at
    `)
    .is('canceled_at', null)
    .gte('appointment_datetime', nowIso)
    .lte('appointment_datetime', lookAheadIso)

  if (error) {
    console.error('[cron/demo-booking-reminders] failed to load sequences', error)
    return NextResponse.json({ ok: false, error: 'Failed to load demo bookings' }, { status: 500 })
  }

  const result = { sent: 0, skipped: 0, errors: 0 }

  for (const sequence of sequences ?? []) {
    if (!sequence.lead_email) {
      result.skipped++
      continue
    }

    const appointmentMs = new Date(sequence.appointment_datetime).getTime()
    const minutesUntil = (appointmentMs - now.getTime()) / 60000
    const toName = [sequence.lead_first_name, sequence.lead_last_name].filter(Boolean).join(' ') || 'there'

    const dueStages: Array<{ stage: DemoBookingEmailStage; sentAt: string | null }> = []
    if (minutesUntil <= 24 * 60 && minutesUntil > 3 * 60 && !sequence.reminder_24h_sent_at) {
      dueStages.push({ stage: 'reminder_24h', sentAt: 'reminder_24h_sent_at' as const })
    }
    if (minutesUntil <= 3 * 60 && minutesUntil > 10 && !sequence.reminder_3h_sent_at) {
      dueStages.push({ stage: 'reminder_3h', sentAt: 'reminder_3h_sent_at' as const })
    }
    if (minutesUntil <= 10 && minutesUntil > 0 && !sequence.reminder_10m_sent_at) {
      dueStages.push({ stage: 'reminder_10m', sentAt: 'reminder_10m_sent_at' as const })
    }

    for (const dueStage of dueStages) {
      const sent = await sendDemoBookingEmail({
        stage: dueStage.stage,
        toEmail: sequence.lead_email,
        toName,
        businessName: sequence.business_name,
        startAt: sequence.appointment_datetime,
        timezone: sequence.timezone,
      })

      if (!sent.success) {
        console.error('[cron/demo-booking-reminders] email send failed', {
          sequenceKey: sequence.sequence_key,
          stage: dueStage.stage,
          error: sent.error,
        })
        result.errors++
        continue
      }

      if (dueStage.stage === 'reminder_24h') {
        await supabase
          .from('demo_booking_sequences')
          .update({ reminder_24h_sent_at: nowIso })
          .eq('sequence_key', sequence.sequence_key)
      } else if (dueStage.stage === 'reminder_3h') {
        await supabase
          .from('demo_booking_sequences')
          .update({ reminder_3h_sent_at: nowIso })
          .eq('sequence_key', sequence.sequence_key)
      } else {
        await supabase
          .from('demo_booking_sequences')
          .update({ reminder_10m_sent_at: nowIso })
          .eq('sequence_key', sequence.sequence_key)
      }

      result.sent++
      await sleep(250)
    }
  }

  return NextResponse.json({ ok: true, result })
}
