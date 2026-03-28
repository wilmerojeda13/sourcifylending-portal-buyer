import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const BLAND_API_KEY = process.env.BLAND_API_KEY

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

  if (!BLAND_API_KEY) {
    return NextResponse.json(
      { error: 'BLAND_API_KEY not configured. Add it to your environment variables.' },
      { status: 503 }
    )
  }

  const { stage, script, voice, max_duration } = await req.json()

  // Fetch leads to call
  let query = supabase
    .from('crm_leads')
    .select('id, phone, first_name, last_name, business_name')
    .eq('is_archived', false)
    .eq('do_not_call', false)

  if (stage && stage !== 'all') query = query.eq('stage', stage)

  const { data: leads, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads?.length) return NextResponse.json({ error: 'No leads found for this filter' }, { status: 400 })

  // Filter out leads with no phone
  const callable = leads.filter(l => l.phone?.trim())
  if (!callable.length) return NextResponse.json({ error: 'No leads with phone numbers found' }, { status: 400 })

  // Build Bland.ai batch payload
  const callData = callable.map(l => ({
    phone_number: l.phone,
    first_name: l.first_name,
    last_name: l.last_name ?? '',
    business_name: l.business_name ?? '',
  }))

  const blandPayload = {
    base_prompt: script,
    call_data: callData,
    voice: voice === 'female' ? 'maya' : 'mason',
    max_duration: Number(max_duration) || 2,
    wait_for_greeting: true,
    record: true,
    webhook: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sourcifylending.com'}/api/webhooks/bland`,
    answered_by_enabled: true,
    metadata: { source: 'sourcify_crm', stage },
  }

  const blandRes = await fetch('https://api.bland.ai/v1/batches', {
    method: 'POST',
    headers: {
      Authorization: BLAND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(blandPayload),
  })

  const blandData = await blandRes.json()
  if (!blandRes.ok) {
    return NextResponse.json(
      { error: blandData.message ?? 'Bland.ai error' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    batch_id: blandData.batch_id,
    total_calls: callable.length,
    message: `Campaign launched! ${callable.length} calls queued via Bland.ai.`,
  })
}
