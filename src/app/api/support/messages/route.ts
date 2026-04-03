import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logMemoryEvent } from '@/lib/ai-memory'
import { logPortalEvent } from '@/lib/portal-events'
import { getBusinessContext } from '@/lib/business-context'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

// ─── Email helper ──────────────────────────────────────────────────────────────
async function sendSupportNotificationEmail(
  userEmail: string,
  subject: string,
  message: string,
  submittedAt: string,
  attachmentUrl?: string | null,
) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    console.warn('[Support] RESEND_API_KEY not set — skipping email notification')
    return
  }

  const attachmentHtml = attachmentUrl
    ? `<div style="margin-top:16px"><p style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px">Attachment</p><a href="${attachmentUrl}" style="color:#16a34a;font-size:14px;text-decoration:underline">View attachment →</a></div>`
    : ''

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
        ${attachmentHtml}
        <p style="margin-top:24px;font-size:13px;color:#6b7280">Reply to <strong>${userEmail}</strong> or log into the admin panel to respond.</p>
      </div>
    </div>
  `

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>',
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

// ─── GET — list the authenticated user's support messages ─────────────────────
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, subject, message, status, admin_reply, attachment_url, created_at, updated_at')
    .eq('user_id', context.activeBusinessId)
    .order('created_at', { ascending: false })

  if (error) {
    const isSchemaError = error.message?.includes('schema cache') || error.code === 'PGRST204'
    return NextResponse.json({
      error: isSchemaError
        ? 'Support inbox is still being set up. Please check back shortly.'
        : 'Unable to load messages. Please try again.',
    }, { status: 500 })
  }
  return NextResponse.json({ messages: data })
}

// ─── POST — submit a new support message (FormData for optional attachment) ───
export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  // Parse FormData (supports both file uploads and plain JSON fallback)
  let subject = '', message = '', attachment: File | null = null
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    subject = ((form.get('subject') as string) ?? '').trim()
    message = ((form.get('message') as string) ?? '').trim()
    attachment = (form.get('attachment') as File | null) ?? null
  } else {
    const body = await req.json()
    subject = (body.subject ?? '').trim()
    message = (body.message ?? '').trim()
  }

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (subject.length > 200) return NextResponse.json({ error: 'Subject too long (max 200 chars)' }, { status: 400 })

  // ── Upload attachment to Supabase Storage ─────────────────────────────────
  let attachmentUrl: string | null = null
  if (attachment && attachment.size > 0) {
    if (!ALLOWED_MIME.includes(attachment.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, PDF' }, { status: 400 })
    }
    if (attachment.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum 5 MB.' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const ext = attachment.name.split('.').pop() ?? 'bin'
    const path = `${context.activeBusinessId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await attachment.arrayBuffer())

    const { error: uploadError } = await serviceClient.storage
      .from('support-attachments')
      .upload(path, buffer, { contentType: attachment.type, upsert: false })

    if (uploadError) {
      console.error('[Support] Storage upload error:', uploadError)
      // Non-fatal — continue without attachment
    } else {
      const { data: urlData } = serviceClient.storage
        .from('support-attachments')
        .getPublicUrl(path)
      attachmentUrl = urlData?.publicUrl ?? null
    }
  }

  // ── Insert message ────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { data: msg, error } = await supabase
    .from('support_messages')
    .insert({
      user_id: context.activeBusinessId,
      user_email: user.email ?? '',
      subject,
      message,
      status: 'open',
      attachment_url: attachmentUrl,
      created_at: now,
      updated_at: now,
    })
    .select('id, subject, message, status, attachment_url, created_at')
    .single()

  if (error) {
    const isSchemaError = error.message?.includes('schema cache') || error.code === 'PGRST204'
    return NextResponse.json({
      error: isSchemaError
        ? "We couldn't send your message right now — support system is being configured. Please try again shortly."
        : "We couldn't send your message right now. Please try again.",
    }, { status: 500 })
  }

  // Fire-and-forget notifications
  sendSupportNotificationEmail(user.email ?? '', subject, message, now, attachmentUrl)
  logMemoryEvent(context.activeBusinessId, 'support_message_sent', `Support message sent: ${subject}`, undefined, msg.id)
  logPortalEvent({
    userId: context.activeBusinessId,
    eventType: 'support_message_sent',
    category: 'support',
    severity: 'info',
    title: `Support message: ${subject}`,
    message: message.substring(0, 200),
    metadata: { user_email: user.email ?? '', subject },
  })

  return NextResponse.json({ message: msg }, { status: 201 })
}
