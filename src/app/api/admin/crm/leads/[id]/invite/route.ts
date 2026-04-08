import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import {
  buildCrmInviteLink,
  buildCrmInviteSummary,
  CRM_INVITE_SOURCE,
  CRM_INVITE_TYPES,
  type CrmInviteType,
  createCrmLeadActivity,
  formatInviteTypeLabel,
  getCrmInviteRows,
  linkCrmInviteAccount,
  normalizeInviteEmail,
} from '@/lib/crm-invites'
import { createTrackedAnalyzerSession } from '@/lib/crm-analyzer-sessions'

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

function buildInviteEmailHtml(opts: {
  leadName: string
  businessName: string | null
  inviteType: CrmInviteType
  inviteLink: string
}) {
  const firstName = opts.leadName.split(' ')[0] || 'there'
  const title = opts.inviteType === 'portal' ? 'Your portal invite is ready' : 'Your pre-analyzer invite is ready'
  const description = opts.inviteType === 'portal'
    ? 'Open your free SourcifyLending portal account so you can review your next steps, track progress, and stay connected after this call.'
    : 'Open your SourcifyLending pre-analyzer so you can review your credit readiness, recommended program, and next best step.'
  const cta = opts.inviteType === 'portal' ? 'Create Free Account' : 'Open Pre-Analyzer'
  const footer = opts.inviteType === 'portal'
    ? 'This link takes you to a tracked account-creation path so your rep can follow your progress.'
    : 'This link takes you to a tracked analyzer path so your rep can follow your progress.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#16a34a;padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="background:rgba(255,255,255,0.2);width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="color:#fff;font-weight:800;font-size:14px;">SL</span>
                </div>
                <span style="color:#fff;font-weight:700;font-size:18px;vertical-align:middle;">SourcifyLending</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:36px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hi ${firstName},</p>
              <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">${description}</p>
              ${opts.businessName ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">Business on file: <strong style="color:#111827;">${opts.businessName}</strong></p>` : ''}
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${opts.inviteLink}"
                      style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;">
                      ${cta} →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                ${footer}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">SourcifyLending · CRM Dialer Invite</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const body = await req.json().catch(() => ({}))
  const inviteType = body.invite_type as CrmInviteType

  if (!CRM_INVITE_TYPES.includes(inviteType)) {
    return NextResponse.json({ error: 'Invalid invite type' }, { status: 400 })
  }

  const { data: lead } = await admin.supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, business_name')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.email) return NextResponse.json({ error: 'Lead needs an email before an invite can be sent' }, { status: 400 })

  const normalizedEmail = normalizeInviteEmail(lead.email)
  const now = new Date().toISOString()

  const { data: inserted, error: insertError } = await admin.supabase
    .from('crm_lead_invites')
    .insert({
      lead_id: lead.id,
      email: normalizedEmail,
      invite_type: inviteType,
      status: 'sent',
      sent_by_user_id: admin.userId,
      sent_at: now,
      metadata: {
        source: CRM_INVITE_SOURCE,
      },
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  let inviteLink = buildCrmInviteLink(inserted.id, inviteType, req.nextUrl.origin)
  let analyzerSessionId: string | null = null
  if (inviteType === 'pre_analyzer') {
    const session = await createTrackedAnalyzerSession({
      supabase: admin.supabase,
      leadId: lead.id,
      repUserId: admin.userId,
      repName: admin.userName,
      sourceContext: 'crm_pre_analyzer_invite',
      origin: req.nextUrl.origin,
      crmInviteId: inserted.id,
      metadata: {
        invite_type: inviteType,
        email: normalizedEmail,
      },
    })
    analyzerSessionId = session.session.id
    inviteLink = `${session.trackedUrl}&crm_invite=${encodeURIComponent(inserted.id)}`
  }
  const html = buildInviteEmailHtml({
    leadName: `${lead.first_name} ${lead.last_name ?? ''}`.trim(),
    businessName: lead.business_name,
    inviteType,
    inviteLink,
  })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SourcifyLending <no-reply@ai.sourcifylending.com>',
      to: [normalizedEmail],
      subject: inviteType === 'portal' ? 'Your SourcifyLending portal invite' : 'Your SourcifyLending pre-analyzer invite',
      html,
      tags: [
        { name: 'lead_id', value: lead.id },
        { name: 'invite_id', value: inserted.id },
        { name: 'invite_type', value: inviteType },
        { name: 'source', value: CRM_INVITE_SOURCE },
      ],
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('[crm-invite] Resend error:', err)
    return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 })
  }

  const emailJson = await emailRes.json().catch(() => null) as { id?: string } | null
  if (emailJson?.id) {
    await admin.supabase
      .from('crm_lead_invites')
      .update({
        resend_email_id: emailJson.id,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(inserted.metadata ?? {}),
          source: CRM_INVITE_SOURCE,
          resend_email_id: emailJson.id,
        },
      })
      .eq('id', inserted.id)
  }

  await createCrmLeadActivity(
    admin.supabase,
    lead.id,
    'email',
    `${formatInviteTypeLabel(inviteType)} invite sent to ${normalizedEmail}`,
    admin.userName,
    {
      invite_id: inserted.id,
      invite_type: inviteType,
      resend_email_id: emailJson?.id ?? null,
      source: CRM_INVITE_SOURCE,
      analyzer_session_id: analyzerSessionId,
    },
  ).catch(() => {})

  const { data: existingProfile } = await admin.supabase
    .from('profiles')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingProfile?.id) {
    await linkCrmInviteAccount(admin.supabase, {
      inviteId: inserted.id,
      userId: existingProfile.id,
      profileId: existingProfile.id,
      email: normalizedEmail,
      createdBy: admin.userName,
      metadata: { existing_account: true },
    })
  }

  await logPortalEvent({
    eventType: inviteType === 'portal' ? 'crm_portal_invite_sent' : 'crm_pre_analyzer_invite_sent',
    category: 'leads',
    title: `${formatInviteTypeLabel(inviteType)} invite sent`,
    message: `${lead.first_name} ${lead.last_name ?? ''}`.trim() || normalizedEmail,
    metadata: {
      lead_id: lead.id,
      invite_id: inserted.id,
      email: normalizedEmail,
      invite_type: inviteType,
      source: CRM_INVITE_SOURCE,
      analyzer_session_id: analyzerSessionId,
    },
    severity: 'info',
    createdBy: admin.userName,
  })

  const rows = await getCrmInviteRows(admin.supabase, lead.id)
  return NextResponse.json({
    ok: true,
    invite: rows[0] ?? inserted,
    invite_summary: buildCrmInviteSummary(rows),
    invite_link: inviteLink,
  })
}
