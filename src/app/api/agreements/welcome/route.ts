import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { sendWelcomeAgreementConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { signed_name, agreement_version, program_label } = await req.json() as {
      signed_name: string
      agreement_version: string
      program_label: string
    }

    if (!signed_name || signed_name.trim().length < 3) {
      return NextResponse.json({ error: 'Full name required' }, { status: 400 })
    }

    const ip = (
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      null
    )
    const userAgent = req.headers.get('user-agent')
    const now = new Date().toISOString()

    const serviceClient = await createServiceClient()

    // 1. Mark profile as having signed welcome gate (critical — gates portal access)
    const { error: profileError } = await serviceClient.from('profiles').update({
      welcome_agreement_signed_at: now,
      welcome_agreement_name: signed_name.trim(),
      updated_at: now,
    }).eq('id', user.id)

    if (profileError) {
      console.error('[WelcomeGate] Profile update error:', profileError)
      return NextResponse.json({ error: 'Failed to save agreement. Please try again.' }, { status: 500 })
    }

    // 2. Log to agreements table (non-blocking — schema may vary)
    try {
      await serviceClient.from('agreements').insert({
        user_id: user.id,
        program: 'portal_access',
        agreement_version: agreement_version ?? 'v2.0',
        gate_type: 'welcome',
        accepted_at: now,
        ip_address: ip,
        user_agent: userAgent,
        created_at: now,
      })
    } catch (agreementErr) {
      // Non-fatal: agreement already recorded on profile
      console.error('[WelcomeGate] Agreement table insert failed (non-fatal):', agreementErr)
    }

    // 3. Log activity
    await logActivity(user.id, 'welcome_agreement_signed', {
      signed_name: signed_name.trim(),
      agreement_version,
      ip_address: ip,
    }, req)

    // 4. Send confirmation email (fire-and-forget)
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const emailTo = profile?.email || user.email || ''
    if (emailTo) {
      sendWelcomeAgreementConfirmation({
        toEmail: emailTo,
        toName: profile?.full_name || signed_name,
        signedName: signed_name.trim(),
        agreementVersion: agreement_version ?? 'v2.0',
        programLabel: program_label,
        signedAt: now,
        ipAddress: ip ?? 'unknown',
      }).catch(err => console.error('[WelcomeGate] Email error:', err))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[WelcomeGate] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
