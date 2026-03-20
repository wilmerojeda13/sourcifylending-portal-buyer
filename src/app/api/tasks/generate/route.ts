import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const PROGRAM_NAMES: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR Card Strategy',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring Membership',
}

interface GeneratedTask {
  title: string
  stage: string
  description: string
  requires_document: boolean
  sort_order: number
}

export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, assigned_program, business_name, account_state')
      .eq('id', user.id)
      .single()

    if (!profile?.assigned_program) {
      return NextResponse.json({ error: 'No program assigned' }, { status: 400 })
    }

    // Check if tasks already exist for this user — don't regenerate if they do
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('task_id')
      .eq('user_id', user.id)
      .limit(1)

    if (existingTasks && existingTasks.length > 0) {
      return NextResponse.json({ message: 'Tasks already exist', generated: false })
    }

    // Fetch analyzer answers from the leads table (most recent)
    const { data: lead } = await supabase
      .from('leads')
      .select('analyzer_answers, readiness_status, risk_flags')
      .eq('email', user.email ?? '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const answers = (lead?.analyzer_answers as Record<string, string>) ?? {}
    const riskFlags = (lead?.risk_flags as string[]) ?? []

    const programName = PROGRAM_NAMES[profile.assigned_program] ?? profile.assigned_program
    const businessName = profile.business_name || answers.business_name || 'your business'
    const entityType = answers.entity_type || 'Business'
    const businessAge = answers.business_age || 'Unknown'
    const industry = answers.industry || 'General'
    const creditScore = answers.credit_score_range || 'Unknown'
    const utilization = answers.utilization_range || 'Unknown'
    const inquiries = answers.inquiry_count_last_90_days || 'Unknown'
    const businessCreditStatus = answers.business_credit_reporting_status || 'Unknown'
    const primaryGoal = answers.primary_goal || 'build_ein_credit'
    const nsfActivity = answers.nsf_last_90_days === 'true' ? 'Yes' : 'No'

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are an expert business credit advisor for SourcifyLending.
Your job is to generate a personalized, actionable onboarding task list for a new client based on their profile.
Tasks should be practical, specific to their situation, and ordered logically (foundational tasks first, then building blocks, then applications).
Always return valid JSON only — no markdown, no explanation, just the array.`

    const userPrompt = `Generate a personalized onboarding roadmap for this client:

Program: ${programName}
Business: ${businessName} (${entityType}, ${businessAge} operating, ${industry})
Personal Credit Score: ${creditScore}
Credit Utilization: ${utilization}
Recent Hard Inquiries: ${inquiries}
NSF Activity Last 90 Days: ${nsfActivity}
Business Credit Profile: ${businessCreditStatus}
Primary Goal: ${primaryGoal}
Risk Flags: ${riskFlags.length > 0 ? riskFlags.join(', ') : 'None'}

Generate 6-8 tasks as a JSON array. Each task should be directly relevant to their situation and program.
Return ONLY this JSON format:
[
  {
    "title": "Short action-oriented title",
    "stage": "Phase name (e.g. Foundation, Profile Setup, Credit Building, Application)",
    "description": "2-3 sentence description of exactly what to do and why it matters for their program.",
    "requires_document": false,
    "sort_order": 1
  }
]`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '[]'

    let generatedTasks: GeneratedTask[] = []
    try {
      const cleaned = raw.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim()
      generatedTasks = JSON.parse(cleaned)
      if (!Array.isArray(generatedTasks)) throw new Error('Not an array')
    } catch {
      console.error('[TaskGen] Failed to parse AI response:', raw)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Insert tasks into DB
    const now = new Date().toISOString()
    const taskRows = generatedTasks.map((t, i) => ({
      task_id: crypto.randomUUID(),
      user_id: user.id,
      program: profile.assigned_program,
      stage: t.stage || 'Onboarding',
      title: t.title,
      description: t.description,
      status: 'pending',
      requires_document: Boolean(t.requires_document),
      sort_order: t.sort_order ?? i + 1,
      created_at: now,
    }))

    const { data: insertedTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(taskRows)
      .select()

    if (insertError) {
      console.error('[TaskGen] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save tasks' }, { status: 500 })
    }

    return NextResponse.json({ generated: true, tasks: insertedTasks })
  } catch (err) {
    console.error('[TaskGen] Error:', err)
    return NextResponse.json({ error: 'Failed to generate tasks' }, { status: 500 })
  }
}
