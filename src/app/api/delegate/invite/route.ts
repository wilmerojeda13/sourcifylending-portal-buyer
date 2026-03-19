import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function sendDelegateInviteEmail(
  toEmail: string,
  ownerName: string,
  inviteToken: string,
) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[Delegate] RESEND_API_KEY not set — skipping invite email')
    return
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite?token=${inviteToken}`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">You've Been Invited to SourcifyLending Portal</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px"><strong>${ownerName}</strong> has invited you as a delegate to help manage their SourcifyLending portal account.</p>
        <p style="font-size:14px;color:#4b5563;margin:0 0 24px">As a delegate, you can access tasks, documents, reports, AI tools, and the support inbox — helping the account owner complete their program goals.</p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${inviteUrl}" style="background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;display:inline-block">Accept Invite & Set Up Access</a>
        </div>
        <p style="font-size:13px;color:#6b7280;margin:0 0 8px">Or copy this link into your browser:</p>
        <p style="font-size:12px;color:#16a34a;word-break:break-all;margin:0 0 24px">${inviteUrl}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px" />
        <p style="font-size:12px;color:#9ca3af;margin:0">If you were not expecting this invite, you can ignore this email. This link will expire if removed by the account owner.</p>
      </div>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
        to: [toEmail],
        subject: `${ownerName} invited you to their SourcifyLending portal`,
        html,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[Delegate] Resend error:', text)
    }
  } catch (err) {
    console.error('[Delegate] Failed to send invite email:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { email } = await req.json() as { email: string }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Get or create client_account for this owner
    let { data: account } = await supabase
      .from('client_accounts')
      .select('id')
      .eq('primary_owner_user_id', user.id)
      .maybeSingle()

    if (!account) {
      const { data: p } = await supabase.from('profiles').select('business_name').eq('id', user.id).single()
      const { data: newAcc } = await supabase
        .from('client_accounts')
        .insert({ primary_owner_user_id: user.id, business_name: p?.business_name ?? null })
        .select('id')
        .single()
      if (newAcc) {
        await supabase.from('account_users').insert({
          account_id: newAcc.id, user_id: user.id, role: 'owner',
          status: 'active', invited_at: new Date().toISOString(), accepted_at: new Date().toISOString(),
        })
        account = newAcc
      }
    }

    if (!account) return NextResponse.json({ error: 'Failed to get account' }, { status: 500 })

    // Check for existing active delegate
    const { data: existing } = await supabase
      .from('account_users')
      .select('id, status')
      .eq('account_id', account.id)
      .eq('role', 'delegate')
      .neq('status', 'removed')
      .maybeSingle()

    if (existing?.status === 'active') {
      return NextResponse.json({ error: 'You already have an active delegate. Remove them before inviting a new one.' }, { status: 400 })
    }

    // If there's a pending invite, remove it and create a fresh one
    if (existing?.status === 'invited') {
      await supabase.from('account_users').update({ status: 'removed', updated_at: new Date().toISOString() }).eq('id', existing.id)
    }

    const { data: ownerProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()

    // Create new invite row (invite_token is auto-generated as default)
    const { data: invite, error: insertErr } = await supabase
      .from('account_users')
      .insert({
        account_id: account.id,
        user_id: null,
        role: 'delegate',
        status: 'invited',
        invited_email: email.toLowerCase(),
        invited_by: user.id,
        invited_at: new Date().toISOString(),
      })
      .select('invite_token')
      .single()

    if (insertErr || !invite) throw insertErr

    await sendDelegateInviteEmail(email, ownerProfile?.full_name ?? 'Your account owner', invite.invite_token)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/delegate/invite error:', error)
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
  }
}
