import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import { getBusinessContext } from '@/lib/business-context'
import Anthropic from '@anthropic-ai/sdk'
import type { ReportType } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const REPORT_PROMPTS: Record<ReportType, (ctx: Record<string, unknown>) => string> = {
  credit_readiness_summary: (ctx) => `
Generate a Credit Readiness Summary for ${ctx.name} (${ctx.business}).
Program: ${ctx.program}
Readiness Status: ${ctx.readiness}
Personal Credit Score Range: ${ctx.credit_score}
Utilization: ${ctx.utilization}
Inquiries (90 days): ${ctx.inquiries}
NSF History: ${ctx.nsf}
Business Credit Status: ${ctx.biz_credit}

Write a professional 3-4 paragraph report covering:
1. Current credit position summary
2. Strengths identified
3. Areas needing improvement
4. Recommended next steps

Do NOT promise outcomes or guarantee results. Keep it factual and actionable.`,

  funding_readiness_analysis: (ctx) => `
Generate a Funding Readiness Analysis for ${ctx.name} (${ctx.business}).
Program: ${ctx.program}
Readiness: ${ctx.readiness}
Stage: ${ctx.stage}
Completed Tasks: ${ctx.completed_tasks}
Total Tasks: ${ctx.total_tasks}
Progress: ${ctx.progress}%

Write a 4-paragraph funding readiness analysis covering:
1. Current funding readiness assessment
2. What's working in their favor
3. Key gaps or blockers
4. Clear path to stronger readiness

Do NOT promise approvals or outcomes.`,

  tradeline_progress_report: (ctx) => `
Generate a Tradeline Progress Report for ${ctx.name} (${ctx.business}).
Program: ${ctx.program}
Stage: ${ctx.stage}
Tasks Completed: ${ctx.completed_tasks} of ${ctx.total_tasks}
Documents on file: ${ctx.doc_count}

Write a structured report covering:
1. Current tradeline-building status
2. Accounts likely reporting (based on completed tasks)
3. Tradelines still needed
4. PAYDEX building guidance
5. Next milestone

Keep factual. No guarantees.`,

  monthly_monitoring_report: (ctx) => `
Generate a Monthly Monitoring Report for ${ctx.name} (${ctx.business}).
Date: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
Program: ${ctx.program}
Stage: ${ctx.stage}
Active: ${ctx.active}
Progress: ${ctx.progress}%

Structure the report as:
**Credit Snapshot** — current credit position summary
**Banking Snapshot** — bank activity observations
**Obligation Risk Scan** — any risk flags
**30-Day Action Plan** — specific actions for next 30 days (numbered list)
**Do / Don't Rules** — 3 dos and 3 don'ts for this month
**Next Check-In Date** — recommended review date

Keep it structured and actionable.`,

  next_step_summary: (ctx) => `
Generate a Next Step Summary for ${ctx.name} (${ctx.business}).
Program: ${ctx.program}
Current Stage: ${ctx.stage}
Next Task: ${ctx.next_task}
Overdue Tasks: ${ctx.overdue}
Documents Missing: ${ctx.docs_missing}

Write a concise 2-3 paragraph Next Step Summary that:
1. States clearly where they are
2. Lists the exact next 3 actions they should take (numbered)
3. Gives a motivating close about their progress

Keep it under 250 words. Direct and actionable.`,
}

// Static sample content shown to demo accounts (no OpenAI call needed)
const DEMO_REPORT_CONTENT: Record<ReportType, string> = {
  credit_readiness_summary: `**Credit Readiness Summary — Sample Report**

Based on the profile data on file, your current credit position reflects a solid foundation with meaningful room for optimization. Your credit score range and utilization levels indicate you are in the early-to-mid stages of credit readiness, with the most impactful improvements available through targeted utilization reduction and inquiry management.

**Strengths Identified:** Your payment history shows consistency, which is the single largest factor in credit scoring. The absence of major derogatory marks and your established account age work in your favor as you move toward funding.

**Areas for Improvement:** Revolving utilization above 30% on any individual card will suppress your score. The goal is to bring all accounts to under 10% utilization before submitting applications. Additionally, minimizing new credit inquiries in the 90 days prior to application will strengthen your profile.

**Recommended Next Steps:** Complete all pending tasks in your program dashboard, focusing first on utilization reduction. Once your readiness status updates to "Ready," the AI agent will walk you through the approved card strategy for your program tier. This is a sample report — generate a live report to see your personalized analysis.`,

  funding_readiness_analysis: `**Funding Readiness Analysis — Sample Report**

Your current funding readiness reflects meaningful progress through your program. Based on task completion rate and document status, you are building the foundational elements required for successful funding applications.

**Working in Your Favor:** Consistent program participation and completed foundational tasks signal strong intent to lenders. The structured approach of your assigned program is designed to build the profile elements lenders prioritize: payment history, credit depth, and utilization management.

**Key Gaps to Address:** The most common blocker at this stage is incomplete business documentation and personal credit optimization. Ensuring all required documents are uploaded and reviewed will accelerate readiness.

**Path Forward:** Focus on completing the next pending task listed on your Progress page. Each completed step builds measurable credit strength. This is a sample report — generate a live report to see your personalized funding readiness score.`,

  tradeline_progress_report: `**Tradeline Progress Report — Sample Report**

Your tradeline-building progress is actively developing through the structured program tasks. Tradelines established through your program are designed to report to the major business credit bureaus, building your Dun & Bradstreet PAYDEX score and Experian Business profile simultaneously.

**Accounts Likely Reporting:** Based on typical program timelines, accounts opened in the early stages of the program should begin reporting within 30–60 days of first use and payment. Consistent on-time payments are critical to maximizing reporting impact.

**Tradelines Still Needed:** Continue progressing through your task list to identify the next set of accounts targeted for your program stage. Your assigned program prioritizes accounts with the strongest reporting track record.

**PAYDEX Guidance:** Aim for a PAYDEX score of 80 or above by paying all business accounts on or before due dates. A score of 80 = paid as agreed; 90+ = paid early. This is a sample report — generate a live report for your current tradeline status.`,

  monthly_monitoring_report: `**Monthly Monitoring Report — Sample**

**Credit Snapshot:** Your credit profile is in active development. Key metrics including score range, utilization, and inquiry count are being managed through your program tasks. Consistency in on-time payments is the primary driver of improvement month over month.

**Banking Snapshot:** Maintaining a positive bank balance with no NSF activity strengthens your overall funding readiness. Lenders review 3–6 months of bank statements; consistent positive balances are a key qualifying factor.

**Obligation Risk Scan:** No major risk flags identified in this sample. In a live report, this section would flag any open collections, charge-offs, or derogatory items requiring action.

**30-Day Action Plan:**
1. Complete all pending program tasks before the end of the month
2. Reduce revolving utilization on any card above 30%
3. Avoid new credit applications outside of your program's guidance
4. Upload any missing documents flagged in your task list
5. Review the AI agent's latest recommendations

**Do / Don't Rules:** Do: Pay early. Do: Keep utilization below 10%. Do: Stay consistent with program tasks. Don't: Open new accounts outside your program. Don't: Close old accounts. Don't: Miss payments.

**Next Check-In Date:** Review your progress dashboard in 30 days. This is a sample report — generate a live report for your personalized monthly analysis.`,

  next_step_summary: `**Next Step Summary — Sample Report**

You are actively progressing through your assigned SourcifyLending program. Your current stage reflects the foundational work required to build a strong, lender-ready profile. The tasks completed so far have established important credit infrastructure that will compound as you continue.

**Your Next 3 Actions:**
1. Complete the next pending task shown on your Progress page — this is the single highest-priority action you can take right now.
2. Ensure all required documents for your current stage are uploaded and marked as submitted — missing documents are the most common cause of program delays.
3. Check in with the AI agent on your dashboard to get a personalized status update and any new recommendations based on recent activity.

You are building real, measurable credit strength through a proven process. Each completed step moves you closer to funding readiness. Stay consistent, follow the program order, and trust the process — the results compound over time. This is a sample report — generate a live report for your personalized next step analysis.`,
}

const REPORT_TITLES: Record<ReportType, string> = {
  credit_readiness_summary: 'Credit Readiness Summary',
  funding_readiness_analysis: 'Funding Readiness Analysis',
  tradeline_progress_report: 'Tradeline Progress Report',
  monthly_monitoring_report: `Monthly Monitoring Report — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
  next_step_summary: 'Next Step Summary',
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = await createServiceClient()

    const { report_type }: { report_type: ReportType } = await req.json()

    const promptFn = REPORT_PROMPTS[report_type]
    if (!promptFn) return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })

    // Check subscription and demo status
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', context.activeBusinessId).single()
    const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
    const isDemo = profile?.is_demo === true

    if (!isActive && !isDemo) {
      return NextResponse.json({ error: 'An active subscription is required to generate reports.' }, { status: 403 })
    }

    // Get user data for context
    const [{ data: tasks }, { data: docs }] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', context.activeBusinessId).order('sort_order'),
      supabase.from('documents').select('document_type,review_status').eq('user_id', context.activeBusinessId),
    ])

    const completedTasks = tasks?.filter((t) => t.status === 'completed') || []
    const pendingTasks = tasks?.filter((t) => t.status === 'pending') || []
    const overdueTasks = tasks?.filter((t) => t.status === 'overdue') || []
    const progress = tasks?.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0

    const programNames: Record<string, string> = {
      program_a: 'Program A — 0% Intro APR Card Strategy',
      program_b: 'Program B — Business Credit Builder',
      program_c: 'Program C — Capital Monitoring Membership',
    }

    const ctx = {
      name: profile?.full_name || 'Client',
      business: profile?.business_name || 'Your Business',
      program: profile?.assigned_program ? programNames[profile.assigned_program] : 'Not assigned',
      readiness: profile?.readiness_status || 'Unknown',
      stage: profile?.current_stage || 'Not set',
      credit_score: profile?.credit_score_range || 'Unknown',
      utilization: profile?.utilization_range || 'Unknown',
      inquiries: profile?.inquiry_range || 'Unknown',
      nsf: profile?.nsf_flag ? 'Yes' : 'No',
      biz_credit: profile?.business_credit_reporting_status || 'Unknown',
      completed_tasks: completedTasks.length,
      total_tasks: tasks?.length || 0,
      progress,
      active: isActive ? 'Yes' : 'No',
      next_task: pendingTasks[0]?.title || 'None',
      overdue: overdueTasks.map((t) => t.title).join(', ') || 'None',
      doc_count: docs?.length || 0,
      docs_missing: 'Review the task list for required documents',
    }

    let content: string

    if (isDemo || !process.env.ANTHROPIC_API_KEY) {
      // Demo accounts (or missing key): use static sample content
      content = DEMO_REPORT_CONTENT[report_type]
    } else {
      // Live report — call Anthropic
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: 'You are a professional business credit consultant generating formal client reports for SourcifyLending. Reports must be professional, factual, and never promise specific credit outcomes or approvals.',
          messages: [{ role: 'user', content: promptFn(ctx) }],
        })
        content = response.content[0]?.type === 'text' ? response.content[0].text : ''
        if (!content) throw new Error('Empty response from AI provider')
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
        console.error('[Reports] AI generation failed:', msg)
        // Fall back to static sample rather than hard-failing
        content = DEMO_REPORT_CONTENT[report_type] + '\n\n*(Note: Live AI generation temporarily unavailable. Showing standard report template.)*'
      }
    }

    const report = {
      report_id: uuidv4(),
      user_id: context.activeBusinessId,
      report_type,
      title: REPORT_TITLES[report_type],
      generated_at: new Date().toISOString(),
      content,
    }

    const { error: insertError } = await supabase.from('reports').insert(report)
    if (insertError) throw insertError

    await logActivity(context.activeBusinessId, 'report_generated', { report_type, report_id: report.report_id }, req)

    return NextResponse.json(report)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Reports] Unexpected error:', msg)
    return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 500 })
  }
}

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const [{ data: profile }, { data: reports }, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', context.activeBusinessId).single(),
    supabase.from('reports').select('*').eq('user_id', context.activeBusinessId).order('generated_at', { ascending: false }),
    supabase.from('memberships').select('program_code').eq('user_id', context.activeBusinessId).eq('status', 'active'),
  ])

  const membershipPrograms = (membershipsResult?.data ?? []).map((membership: { program_code: string }) => membership.program_code).filter(Boolean)
  const activePrograms = membershipPrograms.length > 0 ? membershipPrograms : (profile?.assigned_program ? [profile.assigned_program] : [])
  const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'

  return NextResponse.json({
    profile,
    reports: reports ?? [],
    active_programs: activePrograms,
    is_active: isActive,
  })
}
