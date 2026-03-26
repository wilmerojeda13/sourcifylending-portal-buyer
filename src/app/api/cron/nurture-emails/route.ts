import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendNurtureEmail, NURTURE_SEQUENCE } from '@/lib/nurture-emails'
import { sendOnboardingStepEmail, ONBOARDING_SEQUENCE } from '@/lib/onboarding-emails'

// Vercel Cron: runs daily at 10 AM ET
// vercel.json: { "path": "/api/cron/nurture-emails", "schedule": "0 14 * * *" }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const results = { free: { sent: 0, skipped: 0, errors: 0 }, paid: { sent: 0, skipped: 0, errors: 0 } }

  // ── FREE USER NURTURE ──────────────────────────────────────────────────────
  const { data: freeEnrollments } = await supabase
    .from('nurture_enrollments')
    .select('user_id, enrolled_at, unsubscribe_token')
    .is('unsubscribed_at', null)
    .is('completed_at', null)

  if (freeEnrollments?.length) {
    const userIds = freeEnrollments.map(e => e.user_id)

    // Get profiles for email/name, filter out users who have since upgraded
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_status')
      .in('id', userIds)
      .eq('subscription_status', 'inactive')

    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? [])

    // Get already-sent days for these users
    const { data: sentRows } = await supabase
      .from('nurture_sends')
      .select('user_id, day_number')
      .in('user_id', userIds)

    const sentMap = new Map<string, Set<number>>()
    for (const row of sentRows ?? []) {
      if (!sentMap.has(row.user_id)) sentMap.set(row.user_id, new Set())
      sentMap.get(row.user_id)!.add(row.day_number)
    }

    const allDays = NURTURE_SEQUENCE.map(e => e.day)
    const inserts: { user_id: string; day_number: number }[] = []

    for (const enrollment of freeEnrollments) {
      const profile = profileMap.get(enrollment.user_id)
      if (!profile) {
        results.free.skipped++
        continue // user upgraded, skip
      }

      const daysElapsed = Math.floor(
        (Date.now() - new Date(enrollment.enrolled_at).getTime()) / 86_400_000
      )

      const sent = sentMap.get(enrollment.user_id) ?? new Set()
      const dueDays = allDays.filter(d => d <= daysElapsed && !sent.has(d))

      for (const day of dueDays) {
        const result = await sendNurtureEmail({
          toEmail: profile.email,
          toName: profile.full_name ?? 'there',
          dayNumber: day,
          unsubscribeToken: enrollment.unsubscribe_token,
        })

        if (result.success) {
          inserts.push({ user_id: enrollment.user_id, day_number: day })
          results.free.sent++
        } else {
          console.error(`[nurture] Failed day ${day} for ${profile.email}:`, result.error)
          results.free.errors++
        }
      }

      // Mark completed if all days sent
      const newSent = new Set([...sent, ...dueDays])
      if (allDays.every(d => newSent.has(d))) {
        await supabase
          .from('nurture_enrollments')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', enrollment.user_id)
      }
    }

    if (inserts.length) {
      await supabase.from('nurture_sends').insert(inserts)
    }
  }

  // ── PAID USER ONBOARDING ───────────────────────────────────────────────────
  const { data: paidEnrollments } = await supabase
    .from('onboarding_enrollments')
    .select('user_id, enrolled_at, unsubscribe_token')
    .is('unsubscribed_at', null)
    .is('completed_at', null)

  if (paidEnrollments?.length) {
    const userIds = paidEnrollments.map(e => e.user_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_status, assigned_program')
      .in('id', userIds)
      .eq('subscription_status', 'active')

    const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? [])

    const { data: sentRows } = await supabase
      .from('onboarding_sends')
      .select('user_id, day_number')
      .in('user_id', userIds)

    const sentMap = new Map<string, Set<number>>()
    for (const row of sentRows ?? []) {
      if (!sentMap.has(row.user_id)) sentMap.set(row.user_id, new Set())
      sentMap.get(row.user_id)!.add(row.day_number)
    }

    const allDays = ONBOARDING_SEQUENCE.map(e => e.day)
    const inserts: { user_id: string; day_number: number }[] = []

    for (const enrollment of paidEnrollments) {
      const profile = profileMap.get(enrollment.user_id)
      if (!profile) {
        results.paid.skipped++
        continue
      }

      const daysElapsed = Math.floor(
        (Date.now() - new Date(enrollment.enrolled_at).getTime()) / 86_400_000
      )

      const sent = sentMap.get(enrollment.user_id) ?? new Set()
      const dueDays = allDays.filter(d => d <= daysElapsed && !sent.has(d))

      for (const day of dueDays) {
        const result = await sendOnboardingStepEmail({
          toEmail: profile.email,
          toName: profile.full_name ?? 'there',
          dayNumber: day,
          program: profile.assigned_program ?? 'program_a',
          unsubscribeToken: enrollment.unsubscribe_token,
        })

        if (result.success) {
          inserts.push({ user_id: enrollment.user_id, day_number: day })
          results.paid.sent++
        } else {
          console.error(`[onboarding] Failed day ${day} for ${profile.email}:`, result.error)
          results.paid.errors++
        }
      }

      const newSent = new Set([...sent, ...dueDays])
      if (allDays.every(d => newSent.has(d))) {
        await supabase
          .from('onboarding_enrollments')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', enrollment.user_id)
      }
    }

    if (inserts.length) {
      await supabase.from('onboarding_sends').insert(inserts)
    }
  }

  console.log('[cron/nurture-emails]', results)
  return NextResponse.json({ ok: true, results })
}
