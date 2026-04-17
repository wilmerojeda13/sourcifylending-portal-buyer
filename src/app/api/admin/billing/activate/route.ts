import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { PROGRAM_INFO } from '@/lib/stripe'
import { syncActiveBusinessProfile, syncEditableBusinessProfile } from '@/lib/admin-business-sync'
import type { ProgramId } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const {
      user_id,
      activation_source = 'admin_activated',
      billing_status = 'partial_setup_paid',
      billing_source = 'admin_override',
      deactivate = false,
      notes,
    } = await req.json() as {
      user_id: string
      activation_source?: string
      billing_status?: string
      billing_source?: string
      deactivate?: boolean
      notes?: string
    }

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const newAccessStatus = deactivate ? 'inactive' : 'active'
    const newSubStatus = deactivate ? 'inactive' : 'active'

    // Get profile to know the program
    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_program, plan_tier')
      .eq('id', user_id)
      .single()

    const program = profile?.assigned_program as ProgramId | null
    const programInfo = program ? PROGRAM_INFO[program] : null

    // Update profile subscription_status
    const profileUpdate = {
      subscription_status: newSubStatus,
      plan_tier: deactivate ? (profile?.plan_tier ?? 'free') : 'paid',
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user_id)

    await syncEditableBusinessProfile(supabase, user_id, profileUpdate)
    await syncActiveBusinessProfile(supabase, user_id)

    // Upsert subscription record
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user_id)
      .maybeSingle()

    const subPayload = {
      user_id,
      status: newSubStatus,
      program,
      access_status: newAccessStatus,
      billing_status: deactivate ? 'canceled' : billing_status,
      billing_source: deactivate ? null : billing_source,
      activation_source: deactivate ? null : activation_source,
      setup_fee_standard: programInfo?.setupFee ?? null,
      monthly_fee_standard: programInfo?.monthlyFee ?? null,
      admin_billing_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existingSub) {
      await supabase.from('subscriptions').update(subPayload).eq('user_id', user_id)
    } else {
      await supabase.from('subscriptions').insert({ ...subPayload, created_at: new Date().toISOString() })
    }

    // Keep memberships table in sync so billing page shows the correct active membership card
    if (program) {
      if (deactivate) {
        await supabase.from('memberships').update({
          status: 'canceled',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user_id).eq('program_code', program)
      } else {
        await supabase.from('memberships').upsert({
          user_id,
          program_code: program,
          status: 'active',
          stripe_subscription_id: `admin_${user_id}`,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,program_code' })
      }
    }

    await logActivity(user_id, deactivate ? 'subscription_canceled' : 'subscription_reactivated', {
      admin_action: true,
      admin_email: user.email,
      activation_source,
      billing_status,
      notes: notes ?? 'Admin manual activation',
    }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin billing activate error:', error)
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 })
  }
}
