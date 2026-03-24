import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  checkAIUsage,
  recordAIUsage,
  getEstimatedCostUsd,
  type AIActionType,
} from '@/lib/ai-usage'

const PLATFORM_MAINTENANCE_MESSAGE =
  "The AI assistant is temporarily unavailable due to maintenance, upgrades, or a temporary service issue. We're actively working to restore access as quickly as possible. Please try again shortly."

/** Check system_settings for ai_maintenance flag. Returns { enabled, note }. */
async function getAIMaintenanceStatus(): Promise<{ enabled: boolean; note: string }> {
  try {
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ai_maintenance')
      .single()
    if (!data) return { enabled: false, note: '' }
    const val = data.value as { enabled?: boolean; note?: string }
    return { enabled: val.enabled ?? false, note: val.note ?? '' }
  } catch {
    // If the table doesn't exist yet, treat as not in maintenance
    return { enabled: false, note: '' }
  }
}

export async function POST(req: NextRequest) {
  // ─── Platform-level maintenance / availability check ─────────────────────────
  // This runs BEFORE any user-level checks or OpenAI calls
  try {
    const maintenance = await getAIMaintenanceStatus()
    if (maintenance.enabled) {
      console.warn(
        `[AI-MAINTENANCE] Request blocked — maintenance mode ON. Note: "${maintenance.note}"`
      )
      return NextResponse.json(
        { message: PLATFORM_MAINTENANCE_MESSAGE, platform_maintenance: true },
        { status: 200 }
      )
    }
  } catch (maintErr) {
    // If settings check itself fails, treat as maintenance
    console.error('[AI-MAINTENANCE] Failed to check maintenance status:', maintErr)
    return NextResponse.json(
      { message: PLATFORM_MAINTENANCE_MESSAGE, platform_maintenance: true },
      { status: 200 }
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Agent error: ANTHROPIC_API_KEY is not configured')
    // Treat missing API key as a platform-level issue (not a user credit issue)
    return NextResponse.json(
      { message: PLATFORM_MAINTENANCE_MESSAGE, platform_maintenance: true },
      { status: 200 }
    )
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { messages, action_type } = body

    // ─── Determine action type ─────────────────────────────────────────────────
    // Callers can pass action_type in the request body; default to simple_chat
    const actionType: AIActionType = (action_type as AIActionType) ?? 'simple_chat'

    // ─── Server-side usage check (runs BEFORE calling OpenAI) ─────────────────
    const usageCheck = await checkAIUsage(user.id, actionType)

    if (!usageCheck.allowed) {
      // Log the blocked attempt
      await recordAIUsage(
        user.id,
        '', // program unknown at this point since check failed
        actionType,
        0,
        false,
        '',
        'blocked',
        'none',
        0,
        { reason: usageCheck.reason, message: usageCheck.message }
      )
      return NextResponse.json(
        { message: usageCheck.message, blocked: true, reason: usageCheck.reason },
        { status: 200 }
      )
    }

    const { creditCost, isHeavy, balanceId, program, creditSource, purchasedBucketId } = usageCheck

    // Fetch user context — load all account data before responding
    const [
      { data: profile },
      { data: tasks },
      { data: documents },
      { data: reports },
      { data: memoryProfile },
      { data: recentEvents },
      { data: activeDisputes },
      { data: approvedFunding },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('documents').select('document_type,review_status,file_name').eq('user_id', user.id),
      supabase.from('reports').select('report_type,title,generated_at').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(5),
      // AI memory profile — structured persistent memory
      supabase.from('ai_memory_profiles').select('*').eq('user_id', user.id).single().then(r => r),
      // Recent account events — last 10
      supabase.from('ai_memory_events').select('event_type,event_title,event_details,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10).then(r => r),
      // Active credit disputes
      supabase.from('credit_disputes').select('bureau,item_disputed,status,investigation_deadline').eq('user_id', user.id).in('status', ['Sent', 'Under Investigation', 'Escalated']).then(r => r),
      // Total approved funding
      supabase.from('funding_approvals').select('approved_amount,approved_limit,approval_type,issuer_name,approval_date').eq('user_id', user.id).eq('status', 'Approved').then(r => r),
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

    // Compute total approved funding
    const CREDIT_ACCOUNT_TYPES = ['0% APR Card', 'Business Credit Card', 'Vendor Account', 'Store Account', 'Fleet Account', 'Line of Credit']
    const totalFundingApproved = (approvedFunding ?? []).reduce((sum, a) => {
      const isCreditAccount = CREDIT_ACCOUNT_TYPES.includes(a.approval_type)
      const amt = isCreditAccount ? (a.approved_limit ?? a.approved_amount ?? 0) : (a.approved_amount ?? a.approved_limit ?? 0)
      return sum + Number(amt)
    }, 0)
    const formatMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

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

FUNDING RESULTS:
- Total Approved Capital: ${totalFundingApproved > 0 ? formatMoney(totalFundingApproved) : 'None logged yet'}
- Total Approvals: ${approvedFunding?.length ?? 0}
${approvedFunding && approvedFunding.length > 0
  ? approvedFunding.slice(0, 5).map(a => `- ${a.issuer_name}: ${a.approved_limit ?? a.approved_amount ?? 0} (${a.approval_date})`).join('\n')
  : ''}

ACTIVE CREDIT DISPUTES:
${activeDisputes && activeDisputes.length > 0
  ? activeDisputes.map(d => `- ${d.bureau}: ${d.item_disputed} [${d.status}]${d.investigation_deadline ? ` — deadline ${d.investigation_deadline.split('T')[0]}` : ''}`).join('\n')
  : '- No active disputes'}

${memoryProfile?.last_summary ? `AI MEMORY — PRIOR CONVERSATION SUMMARY:\n${memoryProfile.last_summary}` : ''}
${memoryProfile?.key_facts ? `KEY CLIENT FACTS:\n${memoryProfile.key_facts}` : ''}
${memoryProfile?.next_steps ? `SAVED NEXT STEPS FROM PRIOR SESSION:\n${memoryProfile.next_steps}` : ''}

RECENT ACCOUNT EVENTS (most recent first):
${recentEvents && recentEvents.length > 0
  ? recentEvents.map(e => `- [${e.created_at?.split('T')[0]}] ${e.event_title}${e.event_details ? ': ' + e.event_details : ''}`).join('\n')
  : '- No events logged yet'}

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

${assignedProgram === 'program_b' ? `PROGRAM B GUIDANCE — Business Credit Builder:
- This program is EXCLUSIVELY about building business credit tradelines. It has NOTHING to do with personal credit scores, personal credit optimization, or personal credit assessments.
- NEVER suggest a "Personal Credit Profile Assessment" — that belongs to Program A only
- NEVER mention pulling personal credit reports as a next step
- The program stages in order are: Foundation → Store Credit → Fleet/Gas Cards → Cash Credit → Funding
- Foundation stage: Set up business entity properly (EIN, business address, phone, business bank account, business email), register D-U-N-S number, set up Experian Business and Equifax Business profiles
- Store Credit stage: Apply for net-30 vendor accounts (Uline, Quill, Grainger, etc.) — these report to business credit bureaus and build the tradeline history
- Fleet/Gas Cards stage: Apply for fleet and gas cards that report to business bureaus
- Cash Credit stage: Apply for business credit cards with no personal guarantee
- Funding stage: Apply for business lines of credit and loans
- When the user asks "what's next?": look at their Current Stage and Next Task — guide them through the BUSINESS credit steps for that stage
- Always reference ONLY vendors and accounts from the AVAILABLE OPPORTUNITIES list` : ''}

When a user says "I'm lost" or similar: Respond with their program name, current stage, next task, any missing items, and what happens after the next step.

When asked about missing documents: List required documents for their current stage versus what they've uploaded.

When asked about opportunities, cards, vendors, or lenders: Reference ONLY items from the AVAILABLE OPPORTUNITIES section above. If asked about something not on the list, say it is not part of their current program.

Keep responses focused, structured with bullets when listing items, and always end with a clear next action.`

    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
    let aiMessage = 'I encountered an error. Please try again.'
    let callStatus: 'success' | 'failed' = 'failed'

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 600,
        system: systemPrompt,
        messages,
      })

      aiMessage = response.content[0]?.type === 'text' ? response.content[0].text : aiMessage
      callStatus = 'success'
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      // Determine if this is a platform-level provider failure
      const isPlatformError =
        errMsg.includes('quota') ||
        errMsg.includes('rate_limit') ||
        errMsg.includes('overloaded') ||
        errMsg.includes('503') ||
        errMsg.includes('502') ||
        errMsg.includes('529') ||
        errMsg.includes('overload') ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('network')
      console.error(`[AI-PLATFORM-ERROR] Anthropic call failed (isPlatformError=${isPlatformError}):`, errMsg)
      if (isPlatformError) {
        // Record the failed attempt then return the maintenance message
        await recordAIUsage(
          user.id,
          program,
          actionType,
          0,
          isHeavy,
          balanceId,
          'failed',
          model,
          0,
          { reason: 'provider_error', internal_message: errMsg }
        )
        return NextResponse.json(
          { message: PLATFORM_MAINTENANCE_MESSAGE, platform_maintenance: true },
          { status: 200 }
        )
      }
      aiMessage = `I encountered an error processing your request. Please try again.`
      callStatus = 'failed'
    }

    // ─── Record usage (deducts credits only on success) ────────────────────────
    await recordAIUsage(
      user.id,
      program,
      actionType,
      creditCost,
      isHeavy,
      balanceId,
      callStatus,
      model,
      getEstimatedCostUsd(actionType),
      { action_type: actionType },
      creditSource,
      purchasedBucketId
    )

    return NextResponse.json({ message: aiMessage })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[AI-ORCHESTRATION-ERROR] Unexpected agent failure:', errMsg)
    // Surface all unexpected orchestration failures as the platform maintenance message
    return NextResponse.json(
      { message: PLATFORM_MAINTENANCE_MESSAGE, platform_maintenance: true },
      { status: 200 }
    )
  }
}
