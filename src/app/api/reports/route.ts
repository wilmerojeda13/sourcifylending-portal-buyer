import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import OpenAI from 'openai'
import type { ReportType } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { report_type }: { report_type: ReportType } = await req.json()

    // Check subscription
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'
    if (!isActive) return NextResponse.json({ error: 'Subscription required' }, { status: 403 })

    // Get user data for context
    const [{ data: tasks }, { data: docs }] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('documents').select('document_type,review_status').eq('user_id', user.id),
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

    const promptFn = REPORT_PROMPTS[report_type]
    if (!promptFn) return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })

    const prompt = promptFn(ctx)

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional business credit consultant generating formal client reports for SourcifyLending. Reports must be professional, factual, and never promise specific credit outcomes or approvals.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.6,
    })

    const content = response.choices[0]?.message?.content || 'Report generation failed.'

    const REPORT_TITLES: Record<ReportType, string> = {
      credit_readiness_summary: 'Credit Readiness Summary',
      funding_readiness_analysis: 'Funding Readiness Analysis',
      tradeline_progress_report: 'Tradeline Progress Report',
      monthly_monitoring_report: `Monthly Monitoring Report — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      next_step_summary: 'Next Step Summary',
    }

    const report = {
      report_id: uuidv4(),
      user_id: user.id,
      report_type,
      title: REPORT_TITLES[report_type],
      generated_at: new Date().toISOString(),
      content,
    }

    const { error } = await supabase.from('reports').insert(report)
    if (error) throw error

    await logActivity(user.id, 'report_generated', { report_type, report_id: report.report_id }, req)

    return NextResponse.json(report)
  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 })
  }
}
