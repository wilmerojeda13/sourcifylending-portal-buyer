import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { attachRecipientsToCampaign, getEmailCampaignDraft, updateEmailCampaignDraft } from '@/lib/email-campaign-drafts'
import { processEmailCampaignSendBatch, sendEmailCampaignTest, startEmailCampaignSend } from '@/lib/email-campaign-sends'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null

  return { supabase, userId: user.id }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaignRes = await getEmailCampaignDraft({ id: params.id }, { db: admin.supabase })
  if (!campaignRes.success || !campaignRes.campaign) {
    return NextResponse.json({ error: campaignRes.errorMessage ?? 'campaign_not_found' }, { status: 404 })
  }

  const [unsubscribeRes, suppressionRes] = await Promise.all([
    admin.supabase
      .from('email_unsubscribes')
      .select('id, email, reason, source, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.supabase
      .from('email_suppressions')
      .select('id, email, suppression_type, source, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (unsubscribeRes.error) {
    return NextResponse.json({ error: unsubscribeRes.error.message }, { status: 500 })
  }

  if (suppressionRes.error) {
    return NextResponse.json({ error: suppressionRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    campaign: campaignRes.campaign,
    recent_unsubscribes: unsubscribeRes.data ?? [],
    recent_suppressions: suppressionRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const result = await updateEmailCampaignDraft(
    {
      id: params.id,
      name: typeof body.name === 'string' ? body.name : undefined,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      html_body: typeof body.html_body === 'string' || body.html_body === null ? (body.html_body as string | null) : undefined,
      text_body: typeof body.text_body === 'string' || body.text_body === null ? (body.text_body as string | null) : undefined,
      from_email: typeof body.from_email === 'string' ? body.from_email : undefined,
      from_name: typeof body.from_name === 'string' || body.from_name === null ? (body.from_name as string | null) : undefined,
    },
    { db: admin.supabase },
  )

  if (!result.success) {
    return NextResponse.json({ error: result.errorMessage }, { status: 400 })
  }

  return NextResponse.json({ campaign: result.campaign })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (body.action === 'attach') {
    const result = await attachRecipientsToCampaign(
      {
        campaign_id: params.id,
        recipients: Array.isArray(body.recipients) ? body.recipients as Array<{
          contact_id?: string | null
          email: string
          first_name?: string | null
          last_name?: string | null
        }> : [],
      },
      { db: admin.supabase },
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  if (body.action === 'test') {
    const result = await sendEmailCampaignTest(
      {
        campaignId: params.id,
        recipientEmail: typeof body.recipientEmail === 'string' ? body.recipientEmail : '',
      },
      { db: admin.supabase },
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  if (body.action === 'start') {
    const result = await startEmailCampaignSend({ campaignId: params.id }, { db: admin.supabase })
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  if (body.action === 'batch') {
    const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : 25
    const result = await processEmailCampaignSendBatch(
      {
        campaignId: params.id,
        limit,
      },
      { db: admin.supabase },
    )
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
