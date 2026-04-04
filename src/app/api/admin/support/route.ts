import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sourcifylending.com'

// ─── Email: notify client their message has a reply ──────────────────────────
async function sendReplyNotificationEmail(
  clientEmail: string,
  clientName: string,
  subject: string,
  replyText: string,
) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) return

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">You have a reply from SourcifyLending</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${clientName},</p>
        <p style="font-size:14px;color:#374151;margin:0 0 20px">We've replied to your support message: <strong>${subject}</strong></p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">Our Response</p>
          <p style="font-size:14px;color:#1a1a1a;line-height:1.7;margin:0;white-space:pre-wrap">${replyText}</p>
        </div>

        <p style="font-size:13px;color:#6b7280;margin:0 0 20px">You can view the full conversation and continue messaging us from your portal:</p>

        <a href="${SITE_URL}/support"
          style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:14px;
                 padding:12px 28px;border-radius:10px;text-decoration:none;">
          View in Support Inbox →
        </a>

        <p style="margin-top:28px;font-size:12px;color:#9ca3af;">
          © SourcifyLending · You're receiving this because you submitted a support message through the portal.
        </p>
      </div>
    </div>
  `

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SourcifyLending Support <no-reply@ai.sourcifylending.com>',
        to: [clientEmail],
        subject: `Re: ${subject} — SourcifyLending Support`,
        html: htmlBody,
      }),
    })
  } catch (err) {
    console.error('[Admin Support] Failed to send reply email:', err)
  }
}

// ─── GET — list all support messages (admin only) ────────────────────────────
export async function GET(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') // 'open' | 'replied' | 'closed' | null (all)

  let query = supabase
    .from('support_messages')
    .select('id, user_id, user_email, subject, message, status, admin_reply, attachment_url, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with profile names
  const messages = data ?? []
  if (messages.length > 0) {
    const userIds = Array.from(new Set(messages.map(m => m.user_id).filter(Boolean)))
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, business_name')
      .in('id', userIds)
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    messages.forEach((m: Record<string, unknown>) => {
      m.profiles = profileMap[m.user_id as string] ?? null
    })
  }

  return NextResponse.json({ messages })
}

// ─── PATCH — admin replies to or updates a support message ───────────────────
export async function PATCH(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, admin_reply, status } = await req.json()
  if (!id) return NextResponse.json({ error: 'Message ID required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (admin_reply !== undefined) updates.admin_reply = admin_reply
  if (status !== undefined) updates.status = status
  if (admin_reply) updates.status = 'replied' // auto-mark replied when a reply is saved

  const { data: updated, error } = await supabase
    .from('support_messages')
    .update(updates)
    .eq('id', id)
    .select('id, user_id, user_email, subject, message, status, admin_reply, attachment_url, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch profile for enrichment
  let profile: { full_name?: string; business_name?: string } | null = null
  if (updated) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, business_name')
      .eq('id', updated.user_id)
      .maybeSingle()
    profile = profileData
    ;(updated as Record<string, unknown>).profiles = profile ?? null
  }

  // Send reply email to client + portal notification
  if (admin_reply && updated) {
    const clientName = profile?.full_name || profile?.business_name || 'there'
    const clientEmail = updated.user_email as string

    // Fire-and-forget email
    sendReplyNotificationEmail(clientEmail, clientName, updated.subject as string, admin_reply)

    // In-portal notification
    await supabase.from('notifications').insert({
      user_id: updated.user_id,
      type: 'support_reply',
      title: '💬 New reply from SourcifyLending',
      message: `We've replied to your support message: "${updated.subject}". Click to view your inbox.`,
      read: false,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ message: updated })
}
