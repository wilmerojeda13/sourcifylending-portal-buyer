import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logMemoryEvent } from '@/lib/ai-memory'

// ─── Email helper (Resend API via fetch) ──────────────────────────────────────
async function sendSupportNotificationEmail(
  userEmail: string,
  subject: string,
  message: string,
  submittedAt: string,
) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    console.warn('[Support] RESEND_API_KEY not set — skipping email notification')
    return
  }

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
      <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">New Support Message — SourcifyLending Portal</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px">Client Email</td><td style="padding:8px 0;font-size:14px;font-weight:600">${userEmail}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Subject</td><td style="padding:8px 0;font-size:14px;font-weight:600">${subject}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Submitted</td><td style="padding:8px 0;font-size:14px">${new Date(submittedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</td></tr>
        </table>
        <div style="margin-top:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
          <p style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px">Message</p>
          <p style="font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${message}</p>
        </div>
        <p style="margin-top:24px;font-size:13px;color:#6b7280">Reply to <strong>${userEmail}</strong> or log into the admin panel to respond.</p>
      </div>
    </div>
  `

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SourcifyLending Portal <no-reply@sourcifylending.com>',
        to: ['abel@sourcifylending.com'],
        reply_to: userEmail,
        subject: `New Portal Support Message: ${subject}`,
        html: htmlBody,
      }),
    })
  } catch (err) {
    console.error('[Support] Failed to send email notification:', err)
  }
}

// ─── GET — list the authenticated user's support messages ────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, subject, message, status, admin_reply, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    const isSchemaError = error.message?.includes('schema cache') || error.code === 'PGRST204'
    const msg = isSchemaError
      ? 'Support inbox is still being set up. Please check back shortly.'
      : 'Unable to load messages. Please try again.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json({ messages: data })
}

// ─── POST — submit a new support message ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const subject = (body.subject ?? '').trim()
  const message = (body.message ?? '').trim()

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (subject.length > 200) return NextResponse.json({ error: 'Subject too long (max 200 chars)' }, { status: 400 })

  // Use service client for insert (RLS insert policy requires auth.uid())
  // Regular client is fine here since user is authenticated
  const now = new Date().toISOString()
  const { data: msg, error } = await supabase
    .from('support_messages')
    .insert({
      user_id: user.id,
      user_email: user.email ?? '',
      subject,
      message,
      status: 'open',
      created_at: now,
      updated_at: now,
    })
    .select('id, subject, message, status, created_at')
    .single()

  if (error) {
    const isSchemaError = error.message?.includes('schema cache') || error.code === 'PGRST204'
    const msg = isSchemaError
      ? "We couldn't send your message right now — support system is being configured. Please try again shortly."
      : "We couldn't send your message right now. Please try again."
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Fire-and-forget: email notification + memory event
  sendSupportNotificationEmail(user.email ?? '', subject, message, now)
  logMemoryEvent(user.id, 'support_message_sent', `Support message sent: ${subject}`, undefined, msg.id)

  return NextResponse.json({ message: msg }, { status: 201 })
}
