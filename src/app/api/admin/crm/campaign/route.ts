import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getLeadCompliance } from '@/lib/crm-call-compliance'

const VAPI_API_KEY = process.env.VAPI_API_KEY
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 500
const MAX_LEADS = 500

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

async function logComplianceBlock(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: {
    lead_id: string
    original_phone: string | null
    normalized_phone: string | null
    phone_e164: string | null
    likely_timezone: string | null
    local_time_at_recipient: string | null
    rule_applied: string
    blocked_reason: string
    parse_result: string
    libphonenumber_result: string[]
    fallback_result: {
      npa_nxx: string[]
      area_code: string[]
    }
    final_reason: string
    timezone_source: string
  }
) {
  await supabase.from('crm_call_compliance_logs').insert(payload)
}

export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { stage, script, max_duration, preview_only } = await req.json()

  // Fetch leads filtered by stage, not archived, not DNC — capped at MAX_LEADS
  let query = supabase
    .from('crm_leads')
    .select('*')
    .eq('is_archived', false)
    .eq('do_not_call', false)
    .limit(MAX_LEADS)

  if (stage && stage !== 'all') query = query.eq('stage', stage)

  const { data: leads, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads?.length) return NextResponse.json({ error: 'No leads found for this filter' }, { status: 400 })

  const reviewedLeads = await Promise.all(
    leads.map(async (lead) => {
      const compliance = await getLeadCompliance(lead)
      const merged = { ...lead, ...compliance }

      const needsPersist =
        lead.phone_e164 !== merged.phone_e164 ||
        (lead.likely_timezone ?? null) !== (merged.likely_timezone ?? null) ||
        (lead.timezone_confidence ?? 'unknown') !== merged.timezone_confidence ||
        (lead.timezone_source ?? null) !== (merged.timezone_source ?? null)

      if (needsPersist) {
        void supabase
          .from('crm_leads')
          .update({
            phone_e164: merged.phone_e164,
            likely_timezone: merged.likely_timezone,
            timezone_confidence: merged.timezone_confidence,
            timezone_source: merged.timezone_source,
            last_timezone_checked_at: merged.last_timezone_checked_at,
          })
          .eq('id', lead.id)
          .then(({ error }) => {
            if (error) {
              console.warn('[crm campaign] failed to persist timezone intelligence', error)
            }
          })
      }

      return merged
    })
  )

  const callable = reviewedLeads.filter(lead => lead.call_window_status === 'callable_now' && lead.phone_e164)
  const blocked = reviewedLeads.filter(lead => lead.call_window_status === 'blocked_by_timezone')
  const unknown = reviewedLeads.filter(lead => lead.call_window_status === 'unknown_timezone')

  if (preview_only) {
    return NextResponse.json({
      total_selected: reviewedLeads.length,
      callable_now: callable.length,
      blocked_by_timezone: blocked.length,
      unknown_timezone: unknown.length,
    })
  }

  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return NextResponse.json(
      { error: 'VAPI is not configured. Ensure VAPI_API_KEY, VAPI_ASSISTANT_ID, and VAPI_PHONE_NUMBER_ID are set in your environment variables.' },
      { status: 503 }
    )
  }

  const capped = callable.length >= MAX_LEADS

  await Promise.all(
    [...blocked, ...unknown].map(lead =>
      logComplianceBlock(supabase, {
        lead_id: lead.id,
        original_phone: lead.phone,
        normalized_phone: lead.diagnostics.normalized_phone,
        phone_e164: lead.phone_e164,
        likely_timezone: lead.likely_timezone,
        local_time_at_recipient: lead.recipient_local_time,
        rule_applied: lead.call_window_rule_applied,
        blocked_reason: lead.blocked_reason ?? 'unknown_timezone',
        parse_result: lead.diagnostics.parse_result,
        libphonenumber_result: lead.diagnostics.libphonenumber_result,
        fallback_result: lead.diagnostics.fallback_result,
        final_reason: lead.diagnostics.final_reason,
        timezone_source: lead.timezone_source,
      }).catch(() => {})
    )
  )

  if (!callable.length) {
    return NextResponse.json({
      error: 'No selected leads are currently callable inside the allowed local calling window.',
      total_selected: reviewedLeads.length,
      callable_now: 0,
      blocked_by_timezone: blocked.length,
      unknown_timezone: unknown.length,
    }, { status: 400 })
  }

  // Make VAPI calls in batches of BATCH_SIZE
  let succeeded = 0
  let failed = 0

  for (let i = 0; i < callable.length; i += BATCH_SIZE) {
    const batch = callable.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (lead) => {
        try {
          const payload: Record<string, unknown> = {
            assistantId: VAPI_ASSISTANT_ID,
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            customer: {
              number: lead.phone_e164,
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
    total_selected: reviewedLeads.length,
    total,
    callable_now: callable.length,
    blocked_by_timezone: blocked.length,
    unknown_timezone: unknown.length,
    succeeded,
    failed,
    message: `Campaign launched via VAPI! ${succeeded} calls initiated, ${failed} failed.${cappedNote}`,
  })
}
