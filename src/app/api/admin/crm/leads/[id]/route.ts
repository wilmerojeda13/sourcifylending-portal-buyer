import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('crm_leads').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ lead: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const allowed = [
    'first_name','last_name','phone','email','business_name',
    'stage','program_interest','source','notes','follow_up_at',
    'do_not_call','is_archived','last_contacted_at',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('crm_leads')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log stage changes to activity feed
  if ('stage' in body && body.stage) {
    const leadName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email || 'Unknown'
    logPortalEvent({
      eventType: 'crm_lead_stage_changed',
      category: 'leads',
      title: `Lead Moved: ${leadName}`,
      message: `Stage updated to "${body.stage}".`,
      metadata: {
        lead_id: id,
        stage: body.stage,
        ...(data.email ? { email: data.email } : {}),
        ...(data.business_name ? { business: data.business_name } : {}),
      },
      severity: 'info',
    }).catch(() => {})
  }

  return NextResponse.json({ lead: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { error } = await supabase.from('crm_leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
