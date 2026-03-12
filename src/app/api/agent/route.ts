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

    // Fetch opportunities for this user's program (top 10 by priority)
    const assignedProgram = profile?.assigned_program
    let opportunities: Array<{ name: string; category: string; stage: string; pg_required: string; terms: string | null; description: string | null }> = []
    if (assignedProgram) {
      const { data: opps } = await supabase
        .from('account_opportunities')
        .select('name,category,stage,pg_required,terms,description')
        .in('program', [assignedProgram, 'all'])
        .eq('is_active', true)
        .order('priority_score', { ascending: false })
        .limit(10)
      opportunities = opps ?? []
    }

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
- NEVER mention, recommend, or suggest any lender, card, vendor, or account that is NOT listed in the AVAILABLE OPPORTUNITIES section below — even if you know of it
- ONLY reference opportunities from the AVAILABLE OPPORTUNITIES list; if asked about something not on the list, say it is not part of the client's program
- Be encouraging but always factual
- Keep responses clear, concise, and actionable — especially on mobile
- Use markdown for structure (bold, bullets) but keep it readable
- Do NOT describe any service as "credit repair" — use "personal credit optimization" or "funding readiness guidance"

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

AVAILABLE OPPORTUNITIES (reference ONLY from this list — never invent):
${opportunities.length > 0
  ? opportunities.map((o) => `- **${o.name}** [${o.category}] | Stage: ${o.stage} | PG: ${o.pg_required} | Terms: ${o.terms ?? 'N/A'}\n  ${o.description ?? ''}`).join('\n')
  : '- No opportunities loaded for this program.'}

${assignedProgram === 'program_a' ? `PROGRAM A GUIDANCE — Personal Credit Optimization:
- Before recommending any card applications, verify the client's readiness status
- If readiness is "Not Ready": address blocking factors first (utilization, inquiries, derogatory marks), do NOT push card applications
- If readiness is "Conditionally Ready": name the specific conditions to resolve before applying
- If readiness is "Ready": recommend cards from AVAILABLE OPPORTUNITIES matching their current stage
- Always set realistic expectations — never imply or promise approval` : ''}

When a user says "I'm lost" or similar: Respond with their program name, current stage, next task, any missing items, and what happens after the next step.

When asked about missing documents: List required documents for their current stage versus what they've uploaded.

When asked about opportunities, cards, vendors, or lenders: Reference ONLY items from the AVAILABLE OPPORTUNITIES section above. If asked about something not on the list, say it is not part of their current program.

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
