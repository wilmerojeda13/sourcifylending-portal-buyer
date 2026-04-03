import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { markCrmSmsEvent } from '@/lib/crm-sms'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceClient()

  const { data: sms } = await supabase
    .from('crm_lead_sms')
    .select('id, destination_url')
    .eq('id', id)
    .maybeSingle()

  const fallback = new URL('/signup', req.url)
  fallback.searchParams.set('crm_text', id)

  if (!sms?.id) {
    return NextResponse.redirect(fallback)
  }

  await markCrmSmsEvent(supabase, {
    smsId: sms.id,
    status: 'clicked',
    metadata: {
      source: 'crm_sms_link',
      query: Object.fromEntries(req.nextUrl.searchParams.entries()),
      user_agent: req.headers.get('user-agent'),
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip'),
    },
  }).catch(() => {})

  const destination = new URL(sms.destination_url || fallback.toString(), req.url)
  if (!destination.searchParams.has('crm_text')) {
    destination.searchParams.set('crm_text', id)
  }

  return NextResponse.redirect(destination)
}
