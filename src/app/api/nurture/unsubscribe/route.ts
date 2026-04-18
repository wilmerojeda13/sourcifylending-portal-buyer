import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { APP_URL } from '@/lib/site-config'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const type = req.nextUrl.searchParams.get('type') ?? 'nurture'

  if (!token) {
    return new NextResponse('<p>Invalid unsubscribe link.</p>', { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const supabase = await createServiceClient()
  const table = type === 'onboarding' ? 'onboarding_enrollments' : 'nurture_enrollments'

  const { data, error } = await supabase
    .from(table)
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)
    .select('user_id')
    .maybeSingle()

  const html = (msg: string) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Unsubscribed</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f3f4f6}
.box{background:#fff;border-radius:12px;padding:48px;max-width:480px;text-align:center;border:1px solid #e5e7eb}
h2{margin:0 0 12px;font-size:22px;color:#111827}p{margin:0;color:#6b7280;font-size:15px}
a{display:inline-block;margin-top:24px;color:#16a34a;font-size:14px}</style></head>
<body><div class="box"><h2>${msg}</h2>
<p>Your Sourcify account and portal access remain active.</p>
<a href="${APP_URL}">Return to portal →</a></div></body></html>`

  if (error || !data) {
    return new NextResponse(html('Already unsubscribed'), { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  return new NextResponse(html('You\'ve been unsubscribed'), { status: 200, headers: { 'Content-Type': 'text/html' } })
}

// One-click unsubscribe (RFC 8058)
export async function POST(req: NextRequest) {
  return GET(req)
}
