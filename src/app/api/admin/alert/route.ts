import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'abel@sourcifylending.com'
const FROM = 'SourcifyLending Portal <no-reply@ai.sourcifylending.com>'

async function sendEmail(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [ADMIN_EMAIL], subject, html }),
  })
}

function card(rows: { label: string; value: string }[]) {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top">${r.label}</td>
          <td style="padding:8px 0;font-size:14px;font-weight:600">${r.value}</td>
        </tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse">${rowsHtml}</table>`
}

function wrap(title: string, body: string, footer?: string) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">${title}</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        ${body}
        ${footer ? `<p style="margin-top:20px;font-size:13px;color:#6b7280">${footer}</p>` : ''}
      </div>
    </div>`
}

export async function POST(req: NextRequest) {
  try {
    // Require authenticated user
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, assigned_program')
      .eq('id', user.id)
      .single()

    const body = await req.json() as {
      type: 'task_complete' | 'stage_complete'
      taskTitle?: string
      taskId?: string
      stage?: string
      completedCount?: number
      totalCount?: number
    }

    const userName = profile?.full_name || user.email?.split('@')[0] || 'Unknown'
    const userEmail = profile?.email || user.email || ''
    const program =
      profile?.assigned_program === 'program_a'
        ? 'Program A — APR Cards'
        : profile?.assigned_program === 'program_b'
        ? 'Program B — Biz Credit'
        : profile?.assigned_program || 'Unknown Program'
    const time = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    })

    if (body.type === 'task_complete') {
      const subject = `✅ Task Completed — ${userName}`
      const html = wrap(
        '✅ Task Completed',
        card([
          { label: 'Client', value: userName },
          { label: 'Email', value: userEmail },
          { label: 'Program', value: program },
          { label: 'Task', value: body.taskTitle || body.taskId || '—' },
          { label: 'Progress', value: body.completedCount != null ? `${body.completedCount} / ${body.totalCount} tasks done` : '—' },
          { label: 'Time', value: time },
        ]),
        'Log in to the admin panel to view this client\'s full progress.'
      )
      await sendEmail(subject, html)
    } else if (body.type === 'stage_complete') {
      const subject = `🏆 Stage Completed — ${userName}`
      const html = wrap(
        '🏆 Stage Completed',
        card([
          { label: 'Client', value: userName },
          { label: 'Email', value: userEmail },
          { label: 'Program', value: program },
          { label: 'Stage', value: body.stage || '—' },
          { label: 'Progress', value: body.completedCount != null ? `${body.completedCount} / ${body.totalCount} tasks done` : '—' },
          { label: 'Time', value: time },
        ]),
        'Log in to the admin panel to review and advance this client.'
      )
      await sendEmail(subject, html)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/alert]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
