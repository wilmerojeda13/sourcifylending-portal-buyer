import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

// ─── Stage ordering & metadata ────────────────────────────────────────────────
const B_STAGES = ['Foundation', 'Store Credit', 'Fleet & Gas', 'Cash & Revolving']

const TRADELINE_RANGE: Record<string, string> = {
  Foundation: '0–2 tradelines',
  'Store Credit': '3–5 tradelines',
  'Fleet & Gas': '6–8 tradelines',
  'Cash & Revolving': '9+ tradelines',
}

// ─── Ranking score for opportunities within a stage ───────────────────────────
// Priority: no-PG > D&B reporting > multi-bureau > priority_score
function rankScore(opp: {
  priority_score: number
  pg_required: string | null
  reports_to: string | null
}): number {
  let score = opp.priority_score ?? 50
  if (opp.pg_required === 'no' || opp.pg_required === 'n/a') score += 15
  if (opp.reports_to?.includes('Dun & Bradstreet')) score += 8
  score += (opp.reports_to?.split(',').length ?? 1) * 3
  return score
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Fetch profile + opportunities + task count in parallel ────────────────
    const [
      { data: profile },
      { data: allOpps },
      { count: completedTradelineTasks },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('account_opportunities')
        .select('*')
        .eq('program', 'program_b')
        .eq('is_active', true)
        .order('priority_score', { ascending: false }),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .in('stage', ['Store Credit', 'Fleet & Gas', 'Cash & Revolving']),
    ])

    if (!profile || !allOpps) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 })
    }

    // ── Determine stage ───────────────────────────────────────────────────────
    // Primary: admin-set current_stage | Fallback: tradeline count algorithm
    let currentStageLabel = profile.current_stage ?? null
    const tradelineCount = completedTradelineTasks ?? 0

    // Compute stage from tradeline count per spec
    const computedStage =
      tradelineCount < 3 ? 'Foundation' :
      tradelineCount < 6 ? 'Store Credit' :
      tradelineCount < 9 ? 'Fleet & Gas' :
      'Cash & Revolving'

    // Use admin-set stage if available, otherwise use computed
    if (!currentStageLabel) currentStageLabel = computedStage

    const userStageIdx = B_STAGES.indexOf(currentStageLabel)

    // ── Step 2: Filter opportunities by stage ─────────────────────────────────
    // Exclude monitoring category — those are setup tasks shown in Progress, not apply-for opportunities
    const applyableOpps = allOpps.filter(o => o.category !== 'monitoring')

    const currentStageOpps = applyableOpps.filter(o => o.stage === currentStageLabel)
    // If current stage has no applyable items (e.g. still in Foundation), show Store Credit items
    const effectiveCurrentOpps = currentStageOpps.length > 0
      ? currentStageOpps
      : applyableOpps.filter(o => o.stage === 'Store Credit')
    const futureOpps = applyableOpps.filter(o => B_STAGES.indexOf(o.stage) > userStageIdx)
    const completedStageOpps = applyableOpps.filter(o => B_STAGES.indexOf(o.stage) < userStageIdx)

    // ── Step 3: Eligibility filter + ranking ──────────────────────────────────
    // No-PG accounts first (higher approval probability), then PG
    const noPgFirst = [...effectiveCurrentOpps].sort((a, b) => rankScore(b) - rankScore(a))

    // ── Step 4: Select top 3 ─────────────────────────────────────────────────
    const top3 = noPgFirst.slice(0, 3)

    // ── Step 6: AI Explanation per recommendation ─────────────────────────────
    let explanations: Record<string, string> = {}

    if (top3.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const systemPrompt = `You are a business credit advisor at SourcifyLending.
For each opportunity, write exactly ONE sentence (max 22 words) explaining:
- Why this account is the right choice RIGHT NOW for this client
- What specific bureau it builds and why that matters at this stage
Keep it direct, encouraging, and specific. No fluff.
Return ONLY valid JSON: {"Opportunity Name": "one sentence explanation", ...}`

        const userMsg = `Client profile:
- Current stage: ${currentStageLabel} (${TRADELINE_RANGE[currentStageLabel]})
- Completed tradeline tasks: ${tradelineCount}
- Business age: ${profile.business_age ?? 'unknown'}
- Personal credit: ${profile.credit_score_range ?? 'unknown'}
- Industry: ${profile.industry ?? 'unknown'}
- Entity type: ${profile.entity_type ?? 'unknown'}

Top recommended opportunities for this stage:
${top3.map((o, i) => `${i + 1}. "${o.name}" — reports to: ${o.reports_to ?? 'D&B'}, PG required: ${o.pg_required}, terms: ${o.terms ?? 'Net 30'}`).join('\n')}`

        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 350,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        })

        const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}'
        const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        explanations = JSON.parse(cleaned)
      } catch (e) {
        console.error('[Match] AI explanation error:', e)
        // Fallback: no AI text, description will show instead
      }
    }

    // ── Build final response ──────────────────────────────────────────────────
    const recommended = top3.map(o => ({
      ...o,
      ai_reasoning: explanations[o.name] ?? null,
      approval_probability:
        o.pg_required === 'no' || o.pg_required === 'n/a' ? 'high' :
        o.pg_required === 'varies' ? 'medium' : 'medium',
    }))

    return NextResponse.json({
      stage_label: currentStageLabel,
      computed_stage: computedStage,
      tradeline_count: tradelineCount,
      tradeline_range: TRADELINE_RANGE[currentStageLabel] ?? '',
      recommended,
      locked: futureOpps,
      completed_stages: completedStageOpps,
      stage_counts: {
        current: currentStageOpps.length,
        future: futureOpps.length,
        completed: completedStageOpps.length,
      },
    })
  } catch (e) {
    console.error('[Match] Unexpected error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
