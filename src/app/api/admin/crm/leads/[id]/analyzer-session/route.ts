import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  createTrackedAnalyzerSession,
  listLeadAnalyzerSessions,
} from '@/lib/crm-analyzer-sessions'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
    supabase,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const payload = await listLeadAnalyzerSessions(admin.supabase, leadId)
  return NextResponse.json(payload)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const body = await req.json().catch(() => ({})) as {
    source_context?: string | null
    crm_invite_id?: string | null
    crm_sms_id?: string | null
  }

  const session = await createTrackedAnalyzerSession({
    supabase: admin.supabase,
    leadId,
    repUserId: admin.userId,
    repName: admin.userName,
    sourceContext: body.source_context?.trim() || 'lead_detail',
    origin: req.nextUrl.origin,
    crmInviteId: body.crm_invite_id ?? null,
    crmSmsId: body.crm_sms_id ?? null,
  })

  return NextResponse.json({
    ok: true,
    session: session.session,
    tracked_url: session.trackedUrl,
  })
}
