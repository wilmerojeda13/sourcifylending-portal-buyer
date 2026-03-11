import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages } = await req.json()

    // Fetch user context
    const [
      { data: profile },
      { data: tasks },
      { data: documents },
      { data: reports },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('documents').select('document_type,review_status,file_name').eq('user_id', user.id),
      supabase.from('reports').select('report_type,title,generated_at').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(5),
    ])

    const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'

    const completedTasks = tasks?.filter((t) => t.status === 'completed') || []
    const pendingTasks = tasks?.filter((t) => t.status === 'pending') || []
    const overdueTasks = tasks?.filter((t) => t.status === 'overdue') || []
    const nextTask = pendingTasks[0]

    const programNames: Record<string, string> = {
      program_a: 'Program A — 0% Intro APR Card Strategy',
      program_b: 'Program B — Business Credit Builder',
      program_c: 'Program C — Capital Monitoring Membership',
    }

    const systemPrompt = `You are the AI Fulfillment Agent for SourcifyLending — an AI-powered business credit portal.

You are NOT a general chatbot. You are a specialized fulfillment engine that guides clients through their assigned credit program. Your role is to:
- Guide users step by step through their program
- Know exactly where they are in their journey
- Identify missing items, overdue tasks, and blockers
- Answer questions about their specific stage and next steps
- Generate summaries and progress updates
- Keep the user engaged and moving forward

CRITICAL RULES:
- NEVER promise or guarantee credit approvals, specific credit limits, funding amounts, or outcomes
- NEVER make commitments about what lenders will do
- Be encouraging but always factual
- Keep responses clear, concise, and actionable — especially on mobile
- Use markdown for structure (bold, bullets) but keep it readable

CLIENT CONTEXT:
- Name: ${profile?.full_name || 'Client'}
- Business: ${profile?.business_name || 'Unknown'}
- Program: ${profile?.assigned_program ? programNames[profile.assigned_program] : 'Not assigned'}
- Readiness: ${profile?.readiness_status || 'Unknown'}
- Current Stage: ${profile?.current_stage || 'Not set'}
- Subscription: ${profile?.subscription_status || 'unknown'}
- Active: ${isActive ? 'YES — full access' : 'NO — subscription inactive, limited responses only'}

TASK STATUS:
- Total tasks: ${tasks?.length || 0}
- Completed: ${completedTasks.length}
- Pending (actionable): ${pendingTasks.length}
- Overdue: ${overdueTasks.length}
- Next task: ${nextTask ? `"${nextTask.title}" (${nextTask.stage})` : 'None pending'}

OVERDUE TASKS: ${overdueTasks.map((t) => t.title).join(', ') || 'None'}

DOCUMENTS:
${documents && documents.length > 0
  ? documents.map((d) => `- ${d.document_type}: ${d.review_status}`).join('\n')
  : '- No documents uploaded yet'}

RECENT REPORTS:
${reports && reports.length > 0
  ? reports.map((r) => `- ${r.title} (${r.report_type})`).join('\n')
  : '- No reports generated yet'}

${!isActive ? `
IMPORTANT: This user's subscription is INACTIVE.
- You can answer general program questions
- You cannot give detailed step-by-step guidance or generate reports
- Always remind them to reactivate to get full access
- Keep responses brief` : ''}

When a user says "I'm lost" or similar: Respond with their program name, current stage, next task, any missing items, and what happens after the next step.

When asked about missing documents: List required documents for their current stage versus what they've uploaded.

Keep responses focused, structured with bullets when listing items, and always end with a clear next action.`

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    })

    const message = response.choices[0]?.message?.content || 'I encountered an error. Please try again.'

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Agent error:', error)
    return NextResponse.json(
      { message: 'I\'m having trouble connecting right now. Please try again in a moment.' },
      { status: 200 }
    )
  }
}
