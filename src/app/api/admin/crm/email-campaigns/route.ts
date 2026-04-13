import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createEmailCampaignDraft } from '@/lib/email-campaign-drafts'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null

  return { supabase, userId: user.id }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin.supabase
    .from('email_campaigns')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data ?? [] })
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const result = await createEmailCampaignDraft(
    {
      name: typeof body.name === 'string' ? body.name : '',
      subject: typeof body.subject === 'string' ? body.subject : '',
      html_body: typeof body.html_body === 'string' ? body.html_body : null,
      text_body: typeof body.text_body === 'string' ? body.text_body : null,
      from_email: typeof body.from_email === 'string' ? body.from_email : '',
      from_name: typeof body.from_name === 'string' ? body.from_name : null,
      created_by: admin.userId,
    },
    { db: admin.supabase },
  )

  if (!result.success) {
    return NextResponse.json({ error: result.errorMessage }, { status: 400 })
  }

  return NextResponse.json({ campaign: result.campaign }, { status: 201 })
}
