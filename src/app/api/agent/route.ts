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
    const { messages, action_type, page_context } = body as {
      messages: { role: string; content: string }[]
      action_type?: string
      page_context?: { page?: string; label?: string }
    }

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.sourcifylending.com'

    const systemPrompt = `You are the AI Fulfillment Agent for SourcifyLending — a business credit and funding portal.

════════════════════════════════════════
RESPONSE RULES — READ FIRST, ALWAYS FOLLOW
════════════════════════════════════════
1. DEFAULT to SHORT responses (3–8 lines of useful content). Do NOT write walls of text.
2. For instructions: use NUMBERED STEPS, max 3 at a time. Each step = 1 short sentence.
3. Be SPECIFIC. Tell the client exactly what to do — not general advice.
4. Every step that requires an outside website or app MUST include the tracked link from TRACKED LINKS below.
5. Do NOT repeat yourself. Say it once, clearly.
6. Add a "why" only if it fits in 1 short sentence and actually helps.
7. Expand to longer responses ONLY if the client explicitly asks for more detail.
8. Do NOT describe services as "credit repair" — say "credit optimization" or "funding readiness".
9. NEVER promise approvals, credit limits, or outcomes.
10. NEVER suggest accounts not in AVAILABLE OPPORTUNITIES.

STANDARD RESPONSE FORMAT (for instructional replies):
[One sentence — where they are or what needs to happen next]

1. [What to do]
   → [Tracked link if this involves an outside site]
2. [Next step]
3. [Third step only if needed]

[One closing line only if it adds value]

${page_context?.label ? `════════════════════════════════════════
CURRENT PAGE CONTEXT
════════════════════════════════════════
The client is currently viewing: ${page_context.label}${page_context.page ? ` (${page_context.page})` : ''}
Prioritize advice relevant to what they are looking at right now. If they ask a vague question like "what should I do?" or "explain this", answer in the context of the ${page_context.label} page.

` : ''}════════════════════════════════════════
CLIENT CONTEXT
════════════════════════════════════════
Name: ${profile?.full_name || 'Client'}
Business: ${profile?.business_name || 'Not set'}
Program: ${profile?.assigned_program ? programNames[profile.assigned_program] : 'Not assigned'}
Current Stage: ${profile?.current_stage || 'Not set'}
Readiness: ${profile?.readiness_status || 'Unknown'}
Account: ${isActive ? 'Active' : 'INACTIVE — limited access'}

TASKS: ${completedTasks.length} completed · ${pendingTasks.length} pending · ${overdueTasks.length} overdue
Next Task: ${nextTask ? `"${nextTask.title}" (${nextTask.stage})` : 'None pending'}
${overdueTasks.length > 0 ? `Overdue: ${overdueTasks.map((t) => t.title).join(', ')}` : ''}

DOCUMENTS UPLOADED:
${documents && documents.length > 0
  ? documents.map((d) => `- ${d.document_type}: ${d.review_status}`).join('\n')
  : '- None yet'}

FUNDING SECURED: ${totalFundingApproved > 0 ? formatMoney(totalFundingApproved) : 'None logged'}
${approvedFunding && approvedFunding.length > 0
  ? approvedFunding.slice(0, 3).map(a => `- ${a.issuer_name}: ${a.approved_limit ?? a.approved_amount ?? 0}`).join('\n')
  : ''}

ACTIVE DISPUTES:
${activeDisputes && activeDisputes.length > 0
  ? activeDisputes.map(d => `- ${d.bureau}: ${d.item_disputed} [${d.status}]`).join('\n')
  : '- None'}

${memoryProfile?.last_summary ? `PRIOR SESSION SUMMARY: ${memoryProfile.last_summary}` : ''}
${memoryProfile?.key_facts ? `KEY FACTS: ${memoryProfile.key_facts}` : ''}
${memoryProfile?.next_steps ? `SAVED NEXT STEPS: ${memoryProfile.next_steps}` : ''}

RECENT EVENTS:
${recentEvents && recentEvents.length > 0
  ? recentEvents.slice(0, 5).map(e => `- [${e.created_at?.split('T')[0]}] ${e.event_title}`).join('\n')
  : '- None'}

${!isActive ? `SUBSCRIPTION INACTIVE: Only answer general questions. Do not give step-by-step guidance. Remind them to reactivate.` : ''}

════════════════════════════════════════
TRACKED LINKS — USE THESE, NEVER RAW URLs
════════════════════════════════════════
Always use these portal-tracked links so we log the click:
Bureau Setup:
- D-U-N-S Number: ${siteUrl}/go/duns
- Experian Business Profile: ${siteUrl}/go/experian-biz
- Equifax Business Credit: ${siteUrl}/go/equifax-biz
- Nav Dashboard: ${siteUrl}/go/nav

Net-30 Vendors:
- Uline: ${siteUrl}/go/uline
- Quill (Staples): ${siteUrl}/go/quill
- Grainger: ${siteUrl}/go/grainger
- Amazon Business Net-30: ${siteUrl}/go/amazon-biz
- Home Depot Commercial: ${siteUrl}/go/home-depot
- Crown Office Supplies: ${siteUrl}/go/crown-office
- Wise Business Supplies: ${siteUrl}/go/wise-biz
- Summa Office Supplies: ${siteUrl}/go/summa-office
- Staples Advantage: ${siteUrl}/go/staples

Fleet / Gas Cards:
- Shell Fleet Card: ${siteUrl}/go/shell-fleet
- WEX Fleet Card: ${siteUrl}/go/wex-fleet

Business Credit Cards (no PG):
- Brex: ${siteUrl}/go/brex
- Ramp: ${siteUrl}/go/ramp

Portal Pages (use direct path — no tracking needed):
- Tasks / Progress: ${siteUrl}/progress
- Opportunities: ${siteUrl}/opportunities
- Documents: ${siteUrl}/documents
- Business Credit Monitoring: ${siteUrl}/business-credit-monitoring
- Dashboard: ${siteUrl}/dashboard

════════════════════════════════════════
AVAILABLE OPPORTUNITIES (ONLY reference these)
════════════════════════════════════════
${opportunities.length > 0
  ? opportunities.map((o) => `- ${o.name} [${o.category}] Stage: ${o.stage} | PG: ${o.pg_required} | Terms: ${o.terms ?? 'N/A'}`).join('\n')
  : 'None loaded — do not invent any.'}

════════════════════════════════════════
PROGRAM-SPECIFIC RULES
════════════════════════════════════════
${assignedProgram === 'program_a' ? `PROGRAM A — Personal Credit Optimization:
- Focus: personal credit scores, utilization, 0% intro APR business cards
- If readiness = "Not Ready": fix blockers first (utilization, inquiries, derogatory items). Do NOT push card applications.
- If readiness = "Conditionally Ready": name the exact conditions to resolve.
- If readiness = "Ready": direct to matching card from AVAILABLE OPPORTUNITIES with tracked link.
- Never push applications when client is not ready.` : ''}

${assignedProgram === 'program_b' ? `PROGRAM B — Business Credit Builder:
- Focus: BUSINESS credit ONLY. No personal credit scores, no personal assessments.
- NEVER suggest "Personal Credit Profile Assessment" — wrong program.
- Stage order: Foundation → Store Credit → Fleet/Gas → Cash Credit → Funding
- Foundation: EIN, business address, phone, bank account, email → D-U-N-S → Experian Biz → Equifax Biz
- Store Credit: Net-30 vendors (Uline, Quill, Grainger) that report to business bureaus
- Fleet/Gas: Shell, WEX cards reporting to business bureaus
- Cash Credit: Business cards with no personal guarantee (Brex, Ramp)
- Funding: Lines of credit, business loans
- When asked "what's next?": check Current Stage and Next Task above, respond with the next BUSINESS credit step only.` : ''}

${assignedProgram === 'program_c' ? `PROGRAM C — Capital Monitoring:
- Focus: monitoring alerts, bureau status, credit health tracking
- Direct client to their Business Credit Monitoring page for score updates
- Monitoring page: ${siteUrl}/business-credit-monitoring` : ''}

If no program assigned: ask what program they are in and what their current goal is.`

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
