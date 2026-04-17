import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { syncActiveBusinessProfile, syncEditableBusinessProfile } from '@/lib/admin-business-sync'
import type { ProgramId, SubscriptionStatus } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { user_id, plan_tier, subscription_status, assigned_program, notes } = await req.json() as {
      user_id: string
      plan_tier?: 'free' | 'paid'
      subscription_status?: SubscriptionStatus
      assigned_program?: ProgramId | null
      notes?: string
    }

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Update profile
    const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (plan_tier !== undefined) profileUpdate.feature_tier = plan_tier
    if (subscription_status !== undefined) profileUpdate.billing_status = subscription_status
    if (assigned_program !== undefined) profileUpdate.assigned_program = assigned_program

    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user_id)

    if (profileError) throw profileError

    await syncEditableBusinessProfile(supabase, user_id, profileUpdate)

    await syncActiveBusinessProfile(supabase, user_id)

    // Also update subscriptions table if status changes
    if (subscription_status !== undefined) {
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .single()

      if (existingSub) {
        await supabase
          .from('subscriptions')
          .update({ status: subscription_status, updated_at: new Date().toISOString() })
          .eq('user_id', user_id)
      } else {
        // Create a manual subscription record
        await supabase.from('subscriptions').insert({
          user_id,
          status: subscription_status,
          program: assigned_program ?? null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
      }
    }

    // Log the admin action
    await logActivity(user_id, 'subscription_reactivated', {
      admin_action: true,
      admin_email: user.email,
      subscription_status,
      assigned_program,
      notes: notes ?? 'Admin manual update',
    }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin update-membership error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
