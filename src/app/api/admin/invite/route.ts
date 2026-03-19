import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { v4 as uuidv4 } from 'uuid'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.sourcifylending.com'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin, email').eq('id', user.id).single()
  if (!profile?.is_admin) return null
  return { id: user.id, email: user.email ?? profile.email ?? '' }
}

async function sendInviteEmail(
  toEmail: string,
  firstName: string,
  businessName: string | null | undefined,
  inviteToken: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const inviteUrl = `${SITE_URL}/claim-account?token=${inviteToken}`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#16a34a;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
        <p style="color:#fff;font-size:22px;font-weight:800;margin:0;letter-spacing:-0.5px">SourcifyLending</p>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0">Business Credit &amp; Funding Portal</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:36px 32px;border-radius:0 0 12px 12px">
        <h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px">Welcome, ${firstName}!</h1>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6">
          Your SourcifyLending portal account has been set up${businessName ? ` for <strong>${businessName}</strong>` : ''}.
          Click the button below to set your password and access your dashboard.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a
            href="${inviteUrl}"
            style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.01em"
          >
            Access My Account →
          </a>
        </div>
        <p style="font-size:13px;color:#6b7280;text-align:center;margin:0 0 8px">
          This link is only valid for <strong>72 hours</strong> and can only be used once.
        </p>
        <p style="font-size:13px;color:#6b7280;text-align:center;margin:0">
          If you didn't expect this email, you can safely ignore it.
        </p>
        <div style="border-top:1px solid #f3f4f6;margin-top:32px;padding-top:20px;text-align:center">
          <p style="font-size:12px;color:#9ca3af;margin:0">SourcifyLending &bull; Business Credit &amp; Funding Solutions</p>
          <p style="font-size:12px;color:#9ca3af;margin:4px 0 0">Questions? Reply to this email or contact support.</p>
        </div>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'SourcifyLending <no-reply@ai.sourcifylending.com>',
      to: [toEmail],
      subject: 'Your SourcifyLending Portal Account Is Ready',
      html,
    }),
  })
}

// POST /api/admin/invite — send or resend invite
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, resend } = body as { user_id?: string; resend?: boolean }

  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, business_name, invite_status')
    .eq('id', user_id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (!profile.email) {
    return NextResponse.json({ error: 'Member has no email address' }, { status: 400 })
  }

  // If already accepted and not explicitly resending, block
  if (profile.invite_status === 'accepted' && !resend) {
    return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })
  }

  const inviteToken = uuidv4()
  const inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      invite_token: inviteToken,
      invite_status: 'sent',
      invite_sent_at: new Date().toISOString(),
      invited_by: admin.email,
      invite_expires_at: inviteExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user_id)

  if (updateError) {
    console.error('[admin/invite] Update profile error:', updateError)
    return NextResponse.json({ error: 'Failed to generate invite' }, { status: 500 })
  }

  const firstName = (profile.full_name ?? '').split(' ')[0] || 'there'

  try {
    await sendInviteEmail(profile.email, firstName, profile.business_name, inviteToken)
  } catch (emailErr) {
    console.error('[admin/invite] Email send error:', emailErr)
    // Non-fatal — token is still set
  }

  logPortalEvent({
    userId: user_id,
    eventType: 'invite_sent',
    category: 'accounts',
    title: `Portal invite sent to ${profile.full_name || profile.email}`,
    message: `Invite email sent to ${profile.email}. Link expires in 72 hours.`,
    metadata: { email: profile.email, invited_by: admin.email, resend: Boolean(resend) },
    severity: 'info',
    createdBy: admin.email,
  })

  return NextResponse.json({ success: true })
}

// GET /api/admin/invite?user_id=xxx — get invite status
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get('user_id')
  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('invite_token, invite_status, invite_sent_at, invite_accepted_at, invite_expires_at, invited_by')
    .eq('id', user_id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // Check if token is expired
  const isExpired = profile.invite_expires_at
    ? new Date(profile.invite_expires_at) < new Date()
    : false

  return NextResponse.json({
    invite_token: profile.invite_token,
    invite_status: isExpired && profile.invite_status === 'sent' ? 'expired' : (profile.invite_status ?? 'not_sent'),
    invite_sent_at: profile.invite_sent_at,
    invite_accepted_at: profile.invite_accepted_at,
    invite_expires_at: profile.invite_expires_at,
    invited_by: profile.invited_by,
  })
}
