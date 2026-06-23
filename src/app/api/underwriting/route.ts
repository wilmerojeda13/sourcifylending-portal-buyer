import { type NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { scoreUnderwriting } from '@/lib/underwriting-scorer'
import { logActivity } from '@/lib/activity'
import { sendUnderwritingCompleteEmail } from '@/lib/email'
import { logPortalEvent } from '@/lib/portal-events'
import { getBusinessContext } from '@/lib/business-context'
import { createOpenAIText, extractJsonObject, getOpenAIModel, isOpenAIConfigured } from '@/lib/openai'

// Reviews are valid for 30 days
const REVIEW_VALIDITY_DAYS = 30

// ─── Gate check helper ────────────────────────────────────────────────────────
function underwrtingIsExpired(nextDueAt: string | null): boolean {
  if (!nextDueAt) return true  // never done
  return new Date(nextDueAt) < new Date()
}

// ─── POST /api/underwriting ────────────────────────────────────────────────────
// Accepts the completed underwriting form, runs deterministic scoring + AI
// analysis, saves all results to the user's profile AND underwriting_reviews,
// resets the 30-day clock.

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // 2. Fetch full profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', context.activeBusinessId)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // 3. Business rule guards
    if (profile.member_status === 'prospect') {
      return NextResponse.json({ error: 'Prospects do not require underwriting' }, { status: 400 })
    }
    if (!profile.assigned_program || profile.assigned_program === 'program_c') {
      return NextResponse.json({ error: 'This program does not require underwriting' }, { status: 400 })
    }

    // 4. Parse body
    const body = await req.json()
    const answers: Record<string, string | boolean | number> = body.answers ?? {}

    // 5. Run deterministic scorer
    const scoreResult = scoreUnderwriting({
      program: profile.assigned_program as 'program_a' | 'program_b',
      credit_score_range: profile.credit_score_range,
      utilization_range: profile.utilization_range,
      inquiry_range: profile.inquiry_range,
      nsf_flag: profile.nsf_flag ?? false,
      business_age: profile.business_age,
      entity_type: profile.entity_type,
      uw_annual_revenue_conf: String(answers.uw_annual_revenue_conf ?? ''),
      uw_average_daily_balance: String(answers.uw_average_daily_balance ?? ''),
      uw_outstanding_balances: String(answers.uw_outstanding_balances ?? ''),
      uw_recent_derogatory: Boolean(answers.uw_recent_derogatory),
      uw_public_records: Boolean(answers.uw_public_records),
      uw_total_credit_limit: answers.uw_total_credit_limit ? String(answers.uw_total_credit_limit) : undefined,
      uw_monthly_income: answers.uw_monthly_income ? String(answers.uw_monthly_income) : undefined,
      uw_negative_accounts: answers.uw_negative_accounts != null ? Boolean(answers.uw_negative_accounts) : undefined,
      uw_existing_card_balances: answers.uw_existing_card_balances ? String(answers.uw_existing_card_balances) : undefined,
      uw_authorized_user_status: answers.uw_authorized_user_status != null ? Boolean(answers.uw_authorized_user_status) : undefined,
      uw_duns_status: answers.uw_duns_status ? String(answers.uw_duns_status) : undefined,
      uw_experian_biz_exists: answers.uw_experian_biz_exists != null ? Boolean(answers.uw_experian_biz_exists) : undefined,
      uw_tradelines_count: answers.uw_tradelines_count != null ? Number(answers.uw_tradelines_count) : undefined,
      uw_ein_open_date: answers.uw_ein_open_date ? String(answers.uw_ein_open_date) : undefined,
      uw_existing_biz_debts: answers.uw_existing_biz_debts ? String(answers.uw_existing_biz_debts) : undefined,
    })

    // 6. Compute delta vs previous review
    const prevRiskScore: number | null = profile.uw_risk_score ?? null
    const prevStage: string | null = profile.current_stage ?? null
    const riskScoreDelta = prevRiskScore !== null
      ? prevRiskScore - scoreResult.risk_score  // positive = improvement
      : null
    const stageAdvanced = !!(
      prevStage &&
      scoreResult.determined_stage &&
      prevStage !== scoreResult.determined_stage
    )

    // 7. Run AI analysis (non-blocking)
    let aiSummary: string | null = null
    let aiRecommendations: string[] = []

    if (isOpenAIConfigured()) {
      try {
        const reviewNumber = (profile.underwriting_review_count ?? 0) + 1
        const isReview = reviewNumber > 1
        const programLabel = profile.assigned_program === 'program_a'
          ? 'Program A — 0% Intro APR Card Strategy'
          : 'Program B — Business Credit Builder'

        const systemPrompt = `You are an expert underwriting analyst at SourcifyLending.
${isReview
  ? `This is review #${reviewNumber} for this client. Compare their current profile to their last review and highlight progress or regressions.`
  : 'This is this client\'s first underwriting review.'
}
Write:
1. A 2-3 sentence summary of their current underwriting outcome and what it means for their funding path.
2. Exactly 3-5 specific, actionable next steps for the next 30 days.
${isReview && riskScoreDelta !== null ? `Note: Their risk score ${riskScoreDelta > 0 ? 'improved by ' + riskScoreDelta + ' points' : riskScoreDelta < 0 ? 'worsened by ' + Math.abs(riskScoreDelta) + ' points' : 'stayed the same'} since last review.` : ''}
Return ONLY valid JSON: { "summary": "...", "recommendations": ["...", "..."] }`

        const userMsg = `Client underwriting profile:
Program: ${programLabel}
Review #: ${reviewNumber}
Approval Likelihood: ${scoreResult.approval_likelihood.toUpperCase()}
Risk Score: ${scoreResult.risk_score}/100 ${riskScoreDelta !== null ? `(${riskScoreDelta > 0 ? '+' : ''}${riskScoreDelta} vs last review)` : '(first review)'}
Risk Level: ${scoreResult.risk_level}
${scoreResult.determined_stage ? `Current Stage: ${scoreResult.determined_stage}${stageAdvanced ? ' ← STAGE ADVANCED' : ''}` : ''}

Profile snapshot:
- Credit score: ${profile.credit_score_range ?? 'Not provided'}
- Utilization: ${profile.utilization_range ?? 'Not provided'}
- Business age: ${profile.business_age ?? 'Unknown'}
- Entity type: ${profile.entity_type ?? 'Unknown'}
- NSF flag: ${profile.nsf_flag ? 'YES — warning' : 'No'}

This review's answers:
- Annual revenue: ${answers.uw_annual_revenue_conf ?? 'Not provided'}
- Avg daily balance: ${answers.uw_average_daily_balance ?? 'Not provided'}
- Bank statement history: ${answers.uw_bank_statement_months ?? 'Not provided'}
- Outstanding debts: ${answers.uw_outstanding_balances ?? 'Not provided'}
- Recent derogatory: ${answers.uw_recent_derogatory ? 'YES' : 'No'}
- Public records: ${answers.uw_public_records ? 'YES' : 'No'}
${profile.assigned_program === 'program_b' ? `- DUNS status: ${answers.uw_duns_status ?? 'Not provided'}
- Tradelines count: ${answers.uw_tradelines_count ?? 0}
- Vendor tier readiness: ${answers.uw_vendor_tier_readiness ?? 'Not provided'}` : ''}
${profile.assigned_program === 'program_a' ? `- Total credit limit: ${answers.uw_total_credit_limit ?? 'Not provided'}
- Existing card balances: ${answers.uw_existing_card_balances ?? 'Not provided'}
- Monthly income: ${answers.uw_monthly_income ?? 'Not provided'}` : ''}

Key issues: ${scoreResult.key_issues.length > 0 ? scoreResult.key_issues.join('; ') : 'None'}
${scoreResult.estimated_funding_range ? `Estimated funding range: ${scoreResult.estimated_funding_range}` : ''}`

        const response = await createOpenAIText({
          model: getOpenAIModel(),
          maxTokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        })

        const raw = response.text.trim()
        const cleaned = extractJsonObject(raw)
        const parsed = JSON.parse(cleaned)
        aiSummary = typeof parsed.summary === 'string' ? parsed.summary : null
        aiRecommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      } catch (e) {
        console.error('[Underwriting] AI analysis error:', e)
      }
    }

    // 8. Timestamps
    const now = new Date()
    const nextDue = new Date(now)
    nextDue.setDate(nextDue.getDate() + REVIEW_VALIDITY_DAYS)
    const nowIso = now.toISOString()
    const nextDueIso = nextDue.toISOString()
    const reviewNumber = (profile.underwriting_review_count ?? 0) + 1

    // 9. Insert into underwriting_reviews history table
    await supabase.from('underwriting_reviews').insert({
      user_id: context.activeBusinessId,
      program: profile.assigned_program,
      review_number: reviewNumber,
      completed_at: nowIso,
      approval_likelihood: scoreResult.approval_likelihood,
      risk_level: scoreResult.risk_level,
      risk_score: scoreResult.risk_score,
      determined_stage: scoreResult.determined_stage,
      ai_summary: aiSummary,
      ai_recommendations: aiRecommendations,
      key_issues: scoreResult.key_issues,
      next_accounts: scoreResult.next_accounts,
      estimated_funding_range: scoreResult.estimated_funding_range,
      recommended_issuers: scoreResult.recommended_issuers,
      risk_score_delta: riskScoreDelta,
      stage_advanced: stageAdvanced,
      raw_answers: answers,
    })

    // 10. Update profiles — save current results + snapshot prev + reset clock
    const profileUpdate: Record<string, unknown> = {
      // Cycle timestamps
      underwriting_completed_at: nowIso,
      underwriting_next_due_at: nextDueIso,
      underwriting_review_count: reviewNumber,
      underwriting_program: profile.assigned_program,
      // Snapshot previous for delta
      uw_prev_approval_likelihood: profile.uw_approval_likelihood ?? null,
      uw_prev_risk_score: profile.uw_risk_score ?? null,
      uw_prev_stage: profile.current_stage ?? null,
      // Current results
      uw_approval_likelihood: scoreResult.approval_likelihood,
      uw_risk_level: scoreResult.risk_level,
      uw_risk_score: scoreResult.risk_score,
      uw_ai_summary: aiSummary,
      uw_ai_recommendations: aiRecommendations,
      uw_key_issues: scoreResult.key_issues,
      uw_next_accounts: scoreResult.next_accounts,
      uw_disqualification_reason: scoreResult.disqualification_reason,
      // Form answers
      uw_time_in_business_conf: answers.uw_time_in_business_conf ?? null,
      uw_annual_revenue_conf: answers.uw_annual_revenue_conf ?? null,
      uw_average_daily_balance: answers.uw_average_daily_balance ?? null,
      uw_bank_statement_months: answers.uw_bank_statement_months ?? null,
      uw_outstanding_balances: answers.uw_outstanding_balances ?? null,
      uw_recent_derogatory: Boolean(answers.uw_recent_derogatory),
      uw_public_records: Boolean(answers.uw_public_records),
      updated_at: nowIso,
    }

    if (profile.assigned_program === 'program_a') {
      Object.assign(profileUpdate, {
        uw_total_credit_limit: answers.uw_total_credit_limit ?? null,
        uw_monthly_income: answers.uw_monthly_income ?? null,
        uw_negative_accounts: Boolean(answers.uw_negative_accounts),
        uw_card_application_strategy: answers.uw_card_application_strategy ?? null,
        uw_existing_card_balances: answers.uw_existing_card_balances ?? null,
        uw_authorized_user_status: Boolean(answers.uw_authorized_user_status),
        uw_estimated_funding_range: scoreResult.estimated_funding_range,
        uw_recommended_issuers: scoreResult.recommended_issuers,
      })
    }

    if (profile.assigned_program === 'program_b') {
      Object.assign(profileUpdate, {
        uw_ein: answers.uw_ein ?? null,
        uw_business_state: answers.uw_business_state ?? null,
        uw_duns_status: answers.uw_duns_status ?? null,
        uw_experian_biz_exists: Boolean(answers.uw_experian_biz_exists),
        uw_tradelines_count: Number(answers.uw_tradelines_count ?? 0),
        uw_ein_open_date: answers.uw_ein_open_date ?? null,
        uw_vendor_tier_readiness: answers.uw_vendor_tier_readiness ?? null,
        uw_existing_biz_debts: answers.uw_existing_biz_debts ?? null,
        // Advance stage if score says so and admin hasn't pinned it
        ...(profile.current_stage == null || stageAdvanced
          ? { current_stage: scoreResult.determined_stage }
          : {}),
      })
    }

    await supabase.from('profiles').update(profileUpdate).eq('id', context.activeBusinessId)

    // 11. Log activity
    const eventType = scoreResult.approval_likelihood === 'disqualified'
      ? 'underwriting_disqualified'
      : 'underwriting_completed'

    await logActivity(context.activeBusinessId, eventType, {
      program: profile.assigned_program,
      review_number: reviewNumber,
      approval_likelihood: scoreResult.approval_likelihood,
      risk_score: scoreResult.risk_score,
      risk_score_delta: riskScoreDelta,
      stage_advanced: stageAdvanced,
      determined_stage: scoreResult.determined_stage,
      next_due_at: nextDueIso,
    }, req)

    // 12. Admin notification (fire-and-forget)
    const notifTitle = scoreResult.approval_likelihood === 'disqualified'
      ? `Underwriting Disqualified — ${profile.full_name ?? 'Client'}`
      : `Underwriting Completed — ${profile.full_name ?? 'Client'}`
    const notifMessage = [
      `Program: ${profile.assigned_program === 'program_a' ? 'Program A' : 'Program B'}`,
      `Risk Score: ${scoreResult.risk_score}`,
      `Likelihood: ${scoreResult.approval_likelihood.replace(/_/g, ' ')}`,
      scoreResult.determined_stage ? `Stage: ${scoreResult.determined_stage}` : null,
    ].filter(Boolean).join(' · ')
    logPortalEvent({
      userId: context.activeBusinessId,
      eventType: eventType,
      category: 'accounts',
      title: notifTitle,
      message: notifMessage,
      severity: scoreResult.approval_likelihood === 'disqualified' ? 'warning' : 'success',
      metadata: {
        program: profile.assigned_program,
        risk_score: scoreResult.risk_score,
        approval_likelihood: scoreResult.approval_likelihood,
        review_number: reviewNumber,
        determined_stage: scoreResult.determined_stage,
        next_due_at: nextDueIso,
      },
      createdBy: 'system',
    }).catch(err => console.error('[Underwriting] Notification failed:', err))

    // 13. Email (fire-and-forget)
    sendUnderwritingCompleteEmail({
      toEmail: profile.email,
      toName: profile.full_name ?? 'Client',
      program: profile.assigned_program,
      approvalLikelihood: scoreResult.approval_likelihood,
      riskLevel: scoreResult.risk_level,
      aiSummary,
      aiRecommendations,
      estimatedFundingRange: scoreResult.estimated_funding_range,
      determinedStage: scoreResult.determined_stage,
      keyIssues: scoreResult.key_issues,
      reviewNumber,
      riskScoreDelta,
      nextDueAt: nextDueIso,
    }).catch(err => console.error('[Underwriting] Email failed:', err))

    // Trigger Roadmap Agent after underwriting completes (fire and forget)
    import('@/modules/agents/roadmap-agent').then(({ runRoadmapAgent }) => {
      runRoadmapAgent(context.activeBusinessId).catch(err => console.error('[RoadmapAgent trigger]', err))
    })

    return NextResponse.json({
      success: true,
      review_number: reviewNumber,
      approval_likelihood: scoreResult.approval_likelihood,
      risk_level: scoreResult.risk_level,
      risk_score: scoreResult.risk_score,
      risk_score_delta: riskScoreDelta,
      stage_advanced: stageAdvanced,
      determined_stage: scoreResult.determined_stage,
      disqualified: scoreResult.approval_likelihood === 'disqualified',
      disqualification_reason: scoreResult.disqualification_reason,
      key_issues: scoreResult.key_issues,
      estimated_funding_range: scoreResult.estimated_funding_range,
      ai_summary: aiSummary,
      ai_recommendations: aiRecommendations,
      next_due_at: nextDueIso,
    })
  } catch (e) {
    console.error('[Underwriting] Unexpected error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET /api/underwriting ─────────────────────────────────────────────────────
// Returns current underwriting status + days remaining for the cycle.

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', context.activeBusinessId)
      .single()

    const isExpired = underwrtingIsExpired(profile?.underwriting_next_due_at ?? null)
    const needsUnderwriting =
      profile?.member_status === 'active_member' &&
      (profile?.assigned_program === 'program_a' || profile?.assigned_program === 'program_b') &&
      isExpired

    // Days until next review is due (negative = overdue)
    let daysUntilDue: number | null = null
    if (profile?.underwriting_next_due_at) {
      const due = new Date(profile.underwriting_next_due_at)
      daysUntilDue = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }

    return NextResponse.json({
      needs_underwriting: needsUnderwriting,
      is_expired: isExpired,
      completed_at: profile?.underwriting_completed_at ?? null,
      next_due_at: profile?.underwriting_next_due_at ?? null,
      days_until_due: daysUntilDue,
      review_count: profile?.underwriting_review_count ?? 0,
      approval_likelihood: profile?.uw_approval_likelihood ?? null,
      risk_level: profile?.uw_risk_level ?? null,
      risk_score: profile?.uw_risk_score ?? null,
    })
  } catch (e) {
    console.error('[Underwriting] GET error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
