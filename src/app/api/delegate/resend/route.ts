import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function sendInviteEmail(toEmail: string, ownerName: string, inviteToken: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite?token=${inviteToken}`
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Reminder: You've Been Invited to SourcifyLending Portal</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px">This is a reminder that <strong>${ownerName}</strong> has invited you as a delegate to help manage their SourcifyLending portal account.</p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${inviteUrl}" style="background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;display:inline-block">Accept Invite & Set Up Access</a>
        </div>
        <p style="font-size:13px;color:#6b7280;margin:0 0 8px">Or copy this link:</p>
        <p style="font-size:12px;color:#16a34a;word-break:break-all;margin:0">${inviteUrl}</p>
      </div>
    </div>
  `
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
        to: [toEmail],
        subject: `Reminder: ${ownerName} invited you to their SourcifyLending portal`,
        html,
      }),
    })
  } catch (err) {
    console.error('[Delegate] Resend error on resend:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { account_user_id } = await req.json() as { account_user_id: string }
    if (!account_user_id) return NextResponse.json({ error: 'account_user_id required' }, { status: 400 })

    const supabase = await createServiceClient()

    const { data: invite } = await supabase
      .from('account_users')
      .select('id, invited_email, invite_token, client_accounts(primary_owner_user_id)')
      .eq('id', account_user_id)
      .eq('role', 'delegate')
      .eq('status', 'invited')
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Pending invite not found' }, { status: 404 })

    const ownerUserId = (invite.client_accounts as unknown as { primary_owner_user_id: string } | null)?.primary_owner_user_id
    if (ownerUserId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: ownerProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()

    await sendInviteEmail(invite.invited_email!, ownerProfile?.full_name ?? 'Your account owner', invite.invite_token)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/delegate/resend error:', error)
    return NextResponse.json({ error: 'Failed to resend invite' }, { status: 500 })
  }
}
