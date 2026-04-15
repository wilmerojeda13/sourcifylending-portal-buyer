import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify caller is admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, program, notes } = await req.json() as {
      userId: string
      program?: string
      notes?: string
    }

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const serviceClient = await createServiceClient()
    const now = new Date().toISOString()

    // Guard: prevent granting paid access to free plan users
    const { data: targetUser } = await serviceClient
      .from('profiles')
      .select('plan_tier, full_name')
      .eq('id', userId)
      .single()

    if (targetUser?.plan_tier === 'free') {
      return NextResponse.json(
        { error: 'Cannot grant paid access to free plan users. Upgrade user to paid plan first.' },
        { status: 403 }
      )
    }

    // Update profile with access grant audit trail
    const updatePayload: Record<string, unknown> = {
      access_granted_by: user.id,
      access_granted_at: now,
      access_granted_by_name: adminProfile.full_name || user.email,
      account_state: 'active_member',
      subscription_status: 'active',
      updated_at: now,
    }

    if (program) {
      updatePayload.assigned_program = program
    }

    const { error } = await serviceClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)

    if (error) {
      console.error('[GrantAccess] Profile update error:', error)
      return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 })
    }

    // Log activity on admin's account
    await logActivity(user.id, 'admin_granted_access', {
      target_user_id: userId,
      program,
      notes,
      granted_by_name: adminProfile.full_name,
    }, req)

    // Log activity on client's account
    await logActivity(userId, 'portal_access_granted', {
      granted_by: user.id,
      granted_by_name: adminProfile.full_name || user.email,
      program,
      notes,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[GrantAccess] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
