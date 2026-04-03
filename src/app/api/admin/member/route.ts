import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import type { ProgramId, SubscriptionStatus, ReadinessStatus } from '@/types'

export const dynamic = 'force-dynamic'

// ─── GET /api/admin/member?id=userId ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const userId = req.nextUrl.searchParams.get('id')
    if (!userId) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const [
      { data: profile },
      { data: subscription },
      { data: tasks },
      { data: documents },
      { data: activityLogs },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('subscriptions').select('*').eq('user_id', userId).single(),
      supabase.from('tasks').select('task_id, title, status, stage, sort_order').eq('user_id', userId).order('sort_order'),
      supabase.from('documents').select('document_id, file_name, document_type, review_status, uploaded_at').eq('user_id', userId).order('uploaded_at', { ascending: false }),
      supabase.from('activity_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ])

    if (!profile) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const taskSummary = {
      total: tasks?.length ?? 0,
      completed: tasks?.filter((t) => t.status === 'completed').length ?? 0,
      pending: tasks?.filter((t) => t.status === 'pending').length ?? 0,
      locked: tasks?.filter((t) => t.status === 'locked').length ?? 0,
      overdue: tasks?.filter((t) => t.status === 'overdue').length ?? 0,
    }

    return NextResponse.json({
      profile,
      subscription: subscription ?? null,
      tasks: tasks ?? [],
      taskSummary,
      documents: documents ?? [],
      activityLogs: activityLogs ?? [],
    })
  } catch (error) {
    console.error('Admin GET member error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── PATCH /api/admin/member ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json() as {
      user_id: string
      // Identity
      full_name?: string
      email?: string
      phone?: string
      // Business
      business_name?: string
      business_age?: string | null
      entity_type?: string | null
      industry?: string | null
      // Program / subscription
      subscription_status?: SubscriptionStatus
      assigned_program?: ProgramId | null
      current_stage?: string | null
      readiness_status?: ReadinessStatus | null
      progress_percentage?: number
      account_state?: string
      nsf_flag?: boolean
      portal_blocked?: boolean
      suspicious_signup?: boolean
      suspicious_signup_reason?: string | null
      signup_risk_score?: number | null
      admin_notes?: string | null
    }

    const { user_id, email, ...fields } = body
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Handle email change — must update Supabase Auth AND profiles
    if (email !== undefined) {
      const { error: authEmailErr } = await supabase.auth.admin.updateUserById(user_id, { email })
      if (authEmailErr) {
        return NextResponse.json({ error: `Email update failed: ${authEmailErr.message}` }, { status: 400 })
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (email !== undefined) update.email = email
    if (fields.full_name !== undefined) update.full_name = fields.full_name
    if (fields.phone !== undefined) update.phone = fields.phone
    if (fields.business_name !== undefined) update.business_name = fields.business_name
    if (fields.business_age !== undefined) update.business_age = fields.business_age
    if (fields.entity_type !== undefined) update.entity_type = fields.entity_type
    if (fields.industry !== undefined) update.industry = fields.industry
    if (fields.subscription_status !== undefined) update.subscription_status = fields.subscription_status
    if (fields.assigned_program !== undefined) update.assigned_program = fields.assigned_program
    if (fields.current_stage !== undefined) update.current_stage = fields.current_stage
    if (fields.readiness_status !== undefined) update.readiness_status = fields.readiness_status
    if (fields.progress_percentage !== undefined) update.progress_percentage = fields.progress_percentage
    if (fields.account_state !== undefined) update.account_state = fields.account_state
    if (fields.nsf_flag !== undefined) update.nsf_flag = fields.nsf_flag
    if (fields.portal_blocked !== undefined) update.portal_blocked = fields.portal_blocked
    if (fields.suspicious_signup !== undefined) update.suspicious_signup = fields.suspicious_signup
    if (fields.suspicious_signup_reason !== undefined) update.suspicious_signup_reason = fields.suspicious_signup_reason
    if (fields.signup_risk_score !== undefined) update.signup_risk_score = fields.signup_risk_score
    if (fields.admin_notes !== undefined) update.admin_notes = fields.admin_notes

    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user_id)

    if (updateError) throw updateError

    // Sync subscriptions table if status changed
    if (fields.subscription_status !== undefined) {
      const { data: existingSub } = await supabase.from('subscriptions').select('id').eq('user_id', user_id).single()
      if (existingSub) {
        await supabase.from('subscriptions').update({
          status: fields.subscription_status,
          ...(fields.assigned_program !== undefined ? { program: fields.assigned_program } : {}),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user_id)
      } else {
        await supabase.from('subscriptions').insert({
          user_id,
          status: fields.subscription_status,
          program: fields.assigned_program ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    }

    // Determine event type for logging
    const eventType = fields.suspicious_signup === true
      ? 'admin_profile_updated'
      : fields.portal_blocked === true
      ? 'portal_blocked'
      : fields.portal_blocked === false
      ? 'portal_unblocked'
      : 'admin_profile_updated'

    await logActivity(user_id, eventType, {
      admin_action: true,
      admin_email: user.email,
      changes: fields,
    }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin PATCH member error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
