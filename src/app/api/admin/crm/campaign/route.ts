import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sourcifylending.com'
const WEBHOOK_URL = `${APP_URL}/api/webhooks/vapi`

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 500
const MAX_LEADS = 500

/** Normalize phone to E.164. Assumes US (+1) if no country code. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 7) return `+${digits}` // international — trust as-is
  return null
}

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return NextResponse.json(
      { error: 'VAPI is not configured. Ensure VAPI_API_KEY, VAPI_ASSISTANT_ID, and VAPI_PHONE_NUMBER_ID are set in your environment variables.' },
      { status: 503 }
    )
  }

  const { stage, script, max_duration } = await req.json()

  // Fetch leads filtered by stage, not archived, not DNC — capped at MAX_LEADS
  let query = supabase
    .from('crm_leads')
    .select('id, phone, first_name, last_name, business_name')
    .eq('is_archived', false)
    .eq('do_not_call', false)
    .limit(MAX_LEADS)

  if (stage && stage !== 'all') query = query.eq('stage', stage)

  const { data: leads, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads?.length) return NextResponse.json({ error: 'No leads found for this filter' }, { status: 400 })

  // Filter out leads with no phone
  const callable = leads.filter(l => l.phone?.trim())
  if (!callable.length) return NextResponse.json({ error: 'No leads with phone numbers found' }, { status: 400 })

  const capped = callable.length >= MAX_LEADS

  // Make VAPI calls in batches of BATCH_SIZE
  let succeeded = 0
  let failed = 0

  for (let i = 0; i < callable.length; i += BATCH_SIZE) {
    const batch = callable.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (lead) => {
        try {
          const e164 = toE164(lead.phone ?? '')
          if (!e164) { failed++; return }

          const payload: Record<string, unknown> = {
            assistantId: VAPI_ASSISTANT_ID,
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            customer: {
              number: e164,
              name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || undefined,
            },
            assistantOverrides: {
              variableValues: {
                first_name: lead.first_name ?? '',
                last_name: lead.last_name ?? '',
                business_name: lead.business_name ?? '',
              },
              ...(script ? { firstMessage: script } : {}),
            },
            maxDurationSeconds: (Number(max_duration) || 2) * 60,
          }

          const res = await fetch('https://api.vapi.ai/call/phone', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${VAPI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            succeeded++
          } else {
            console.error(`VAPI call failed for lead ${lead.id}:`, await res.text())
            failed++
          }
        } catch (err) {
          console.error(`VAPI call error for lead ${lead.id}:`, err)
          failed++
        }
      })
    )

    // Delay between batches (skip delay after the last batch)
    if (i + BATCH_SIZE < callable.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  const total = callable.length
  const cappedNote = capped
    ? ` This run was capped at ${MAX_LEADS} leads. Run the campaign again to continue calling remaining leads.`
    : ''

  return NextResponse.json({
    success: true,
    total,
    succeeded,
    failed,
    message: `Campaign launched via VAPI! ${succeeded} calls initiated, ${failed} failed.${cappedNote}`,
  })
}
