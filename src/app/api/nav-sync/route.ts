import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { text } = body as { text?: string }

  if (!text?.trim()) {
    return NextResponse.json({ error: 'No data provided' }, { status: 400 })
  }

  // ── Use AI to extract scores from pasted Nav dashboard text ─────────────────
  let extracted: {
    paydex_score: number | null
    experian_score: number | null
    equifax_score: number | null
    tradeline_count: number | null
    notes: string[]
  } = {
    paydex_score: null,
    experian_score: null,
    equifax_score: null,
    tradeline_count: null,
    notes: [],
  }

  try {
    const extractionPrompt = `You are a business credit data extraction assistant. The user has pasted text from their Nav business credit dashboard. Extract the following fields if present:

1. PAYDEX score (D&B, 0–100)
2. Experian Business score / Intelliscore (0–100)
3. Equifax Business credit score (0–100 or 101–816 depending on model)
4. Number of tradelines / accounts
5. Any other notable signals (late payments, new accounts, score changes, alerts)

Return a JSON object ONLY with these exact keys (use null if not found):
{
  "paydex_score": number or null,
  "experian_score": number or null,
  "equifax_score": number or null,
  "tradeline_count": number or null,
  "notes": ["string array of notable signals or changes"]
}

Input data:
${text.slice(0, 4000)}`

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: extractionPrompt }],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    extracted = JSON.parse(cleaned)
  } catch (err) {
    console.error('[nav-sync] AI extraction failed:', err)
    return NextResponse.json({ error: 'Could not extract scores from the provided text. Please try again or paste more complete data.' }, { status: 422 })
  }

  // ── Load current profile to compute diff ─────────────────────────────────────
  const { data: current } = await supabase
    .from('business_credit_profile')
    .select('paydex_score, intelliscore, equifax_score, nav_last_synced_at, nav_sync_history')
    .eq('user_id', user.id)
    .maybeSingle()

  const now = new Date().toISOString()
  const changes: string[] = []

  if (extracted.paydex_score !== null) {
    const prev = current?.paydex_score ?? null
    if (prev === null) changes.push(`PAYDEX score detected: ${extracted.paydex_score}`)
    else if (extracted.paydex_score > prev) changes.push(`PAYDEX increased: ${prev} → ${extracted.paydex_score} (+${extracted.paydex_score - prev})`)
    else if (extracted.paydex_score < prev) changes.push(`PAYDEX decreased: ${prev} → ${extracted.paydex_score} (${extracted.paydex_score - prev})`)
    else changes.push(`PAYDEX unchanged: ${extracted.paydex_score}`)
  }

  if (extracted.experian_score !== null) {
    const prev = current?.intelliscore ?? null
    if (prev === null) changes.push(`Experian Intelliscore detected: ${extracted.experian_score}`)
    else if (extracted.experian_score > prev) changes.push(`Experian score increased: ${prev} → ${extracted.experian_score}`)
    else if (extracted.experian_score < prev) changes.push(`Experian score decreased: ${prev} → ${extracted.experian_score}`)
    else changes.push(`Experian score unchanged: ${extracted.experian_score}`)
  }

  if (extracted.equifax_score !== null) {
    const prev = current?.equifax_score ?? null
    if (prev === null) changes.push(`Equifax score detected: ${extracted.equifax_score}`)
    else if (extracted.equifax_score > prev) changes.push(`Equifax score increased: ${prev} → ${extracted.equifax_score}`)
    else if (extracted.equifax_score < prev) changes.push(`Equifax score decreased: ${prev} → ${extracted.equifax_score}`)
    else changes.push(`Equifax score unchanged: ${extracted.equifax_score}`)
  }

  if (extracted.tradeline_count !== null) {
    changes.push(`Tradelines on file: ${extracted.tradeline_count}`)
  }

  if (extracted.notes?.length > 0) {
    changes.push(...extracted.notes)
  }

  // ── AI Insights ──────────────────────────────────────────────────────────────
  let aiInsights: string[] = []
  let nextActions: string[] = []
  try {
    const insightPrompt = `You are a business credit advisor. Based on these business credit scores, give 2–3 short insights and 2–3 specific next actions.

Scores:
- PAYDEX (D&B): ${extracted.paydex_score ?? 'not reported'}
- Experian Intelliscore: ${extracted.experian_score ?? 'not reported'}
- Equifax Business: ${extracted.equifax_score ?? 'not reported'}
- Tradelines: ${extracted.tradeline_count ?? 'unknown'}

Return JSON only:
{
  "insights": ["2-3 short insight strings"],
  "next_actions": ["2-3 specific action strings"]
}`

    const insightRes = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: insightPrompt }],
    })

    const raw = insightRes.content[0]?.type === 'text' ? insightRes.content[0].text : ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    aiInsights = parsed.insights ?? []
    nextActions = parsed.next_actions ?? []
  } catch {
    aiInsights = ['Sync complete — review your scores above.']
    nextActions = ['Pay all vendor invoices early to improve PAYDEX.']
  }

  // ── Build sync history entry ──────────────────────────────────────────────────
  const historyEntry = {
    synced_at: now,
    paydex_score: extracted.paydex_score,
    experian_score: extracted.experian_score,
    equifax_score: extracted.equifax_score,
    tradeline_count: extracted.tradeline_count,
    changes,
  }

  const existingHistory = Array.isArray(current?.nav_sync_history) ? current.nav_sync_history : []
  const newHistory = [historyEntry, ...existingHistory].slice(0, 12) // keep last 12 syncs

  // ── Upsert profile ────────────────────────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {
    user_id: user.id,
    nav_connection_status: 'connected',
    nav_last_synced_at: now,
    nav_sync_history: newHistory,
    updated_at: now,
  }
  if (extracted.paydex_score !== null) updatePayload.paydex_score = extracted.paydex_score
  if (extracted.experian_score !== null) updatePayload.intelliscore = extracted.experian_score
  if (extracted.equifax_score !== null) updatePayload.equifax_score = extracted.equifax_score

  const { error: upsertErr } = await supabase
    .from('business_credit_profile')
    .upsert(updatePayload, { onConflict: 'user_id' })

  if (upsertErr) {
    console.error('[nav-sync] Upsert error:', upsertErr)
    return NextResponse.json({ error: 'Failed to save sync data' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    extracted,
    changes,
    ai_insights: aiInsights,
    next_actions: nextActions,
    synced_at: now,
  })
}

// GET — return current nav sync status
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('business_credit_profile')
    .select('nav_connection_status, nav_last_synced_at, nav_sync_history, paydex_score, intelliscore, equifax_score')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    nav_status: data?.nav_connection_status ?? 'not_connected',
    nav_last_synced_at: data?.nav_last_synced_at ?? null,
    nav_sync_history: data?.nav_sync_history ?? [],
    paydex_score: data?.paydex_score ?? null,
    experian_score: data?.intelliscore ?? null,
    equifax_score: data?.equifax_score ?? null,
  })
}
