import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sourcifylending.com'
const WEBHOOK_URL = `${APP_URL}/api/webhooks/vapi`

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return NextResponse.json(
      { error: 'VAPI is not configured. Ensure VAPI_API_KEY, VAPI_ASSISTANT_ID, and VAPI_PHONE_NUMBER_ID are set.' },
      { status: 503 }
    )
  }

  const { phone_number, first_name, business_name } = await req.json()

  if (!phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }

  const payload = {
    assistantId: VAPI_ASSISTANT_ID,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: {
      number: phone_number.trim(),
      name: first_name ?? 'Test',
    },
    assistantOverrides: {
      variableValues: {
        first_name: first_name ?? 'Test',
        last_name: '',
        business_name: business_name ?? 'Test Business',
      },
    },
    maxDurationSeconds: 300, // 5-minute cap for test calls
    serverUrl: WEBHOOK_URL,
  }

  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.message ?? 'VAPI error — could not initiate test call' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    call_id: data.id,
    message: 'Test call initiated',
  })
}
