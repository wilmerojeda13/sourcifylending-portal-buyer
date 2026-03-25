import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, supabase: null }
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { user: null, supabase: null }
  return { user, supabase }
}

// POST /api/admin/member/password
// Body: { user_id, new_password } — force set password
// Body: { user_id, send_reset: true } — send password reset email to user
export async function POST(req: NextRequest) {
  const { user, supabase } = await requireAdmin()
  if (!user || !supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    user_id: string
    new_password?: string
    send_reset?: boolean
  }

  const { user_id, new_password, send_reset } = body
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  // Get user's email for reset flow
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', user_id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // ── Send password reset email ────────────────────────────────────────────────
  if (send_reset) {
    const { error: resetErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
    })
    if (resetErr) {
      return NextResponse.json({ error: `Reset failed: ${resetErr.message}` }, { status: 500 })
    }

    // Send via Resend
    const key = process.env.RESEND_API_KEY
    if (key) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.sourcifylending.com'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SourcifyLending <no-reply@ai.sourcifylending.com>',
          to: [profile.email],
          subject: 'Reset Your SourcifyLending Password',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
                <p style="color:#fff;font-size:20px;font-weight:800;margin:0">SourcifyLending</p>
              </div>
              <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
                <h1 style="font-size:18px;font-weight:700;margin:0 0 12px">Password Reset Request</h1>
                <p style="font-size:14px;color:#374151;margin:0 0 24px">
                  Hi ${profile.full_name?.split(' ')[0] || 'there'}, your SourcifyLending password reset was requested.
                  Click the button below to set a new password.
                </p>
                <div style="text-align:center;margin:24px 0">
                  <a href="${siteUrl}/login" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 32px;border-radius:10px">
                    Reset My Password →
                  </a>
                </div>
                <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">
                  If you didn&apos;t request this, you can safely ignore this email.
                </p>
              </div>
            </div>
          `,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, action: 'reset_sent' })
  }

  // ── Force-set new password ───────────────────────────────────────────────────
  if (new_password) {
    if (new_password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const { error: pwErr } = await supabase.auth.admin.updateUserById(user_id, {
      password: new_password,
    })

    if (pwErr) {
      return NextResponse.json({ error: `Password update failed: ${pwErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'password_set' })
  }

  return NextResponse.json({ error: 'Provide new_password or send_reset:true' }, { status: 400 })
}
