import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return supabase
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_leads',
    description: 'Search and filter CRM leads. Use this to find leads by stage, name, phone, follow-up due, or program. Returns matching leads with their details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage:          { type: 'string', enum: ['new','contacted','qualified','demo_scheduled','closed_won','closed_lost'], description: 'Filter by stage' },
        search:         { type: 'string', description: 'Search by name, business, or phone' },
        follow_up_due:  { type: 'boolean', description: 'If true, only return leads with follow-up overdue or due today' },
        program:        { type: 'string', enum: ['program_a','program_b','program_c'], description: 'Filter by program interest' },
        limit:          { type: 'number', description: 'Max results to return (default 20)' },
      },
    },
  },
  {
    name: 'get_lead',
    description: 'Get full details for a specific lead by their ID or phone number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string', description: 'Lead UUID' },
        phone:   { type: 'string', description: 'Lead phone number (use if you have phone but not ID)' },
      },
    },
  },
  {
    name: 'update_lead',
    description: 'Update a CRM lead — change their stage, notes, follow-up date, program interest, or mark as DNC. You can update one or multiple fields at once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id:          { type: 'string', description: 'Lead UUID (required)' },
        stage:            { type: 'string', enum: ['new','contacted','qualified','demo_scheduled','closed_won','closed_lost'] },
        notes:            { type: 'string', description: 'Update or append notes' },
        follow_up_at:     { type: 'string', description: 'ISO date for next follow-up (e.g. 2026-04-01T10:00:00Z)' },
        do_not_call:      { type: 'boolean', description: 'Mark as DNC' },
        program_interest: { type: 'string', enum: ['program_a','program_b','program_c'] },
        last_contacted_at:{ type: 'string', description: 'ISO datetime of last contact' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'log_activity',
    description: 'Log a call, note, email, voicemail, or stage change on a lead. This creates an activity record in their timeline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string', description: 'Lead UUID' },
        type:    { type: 'string', enum: ['call','note','email','voicemail','sms','stage_change','follow_up_set'], description: 'Activity type' },
        body:    { type: 'string', description: 'Activity note or summary' },
      },
      required: ['lead_id', 'type', 'body'],
    },
  },
  {
    name: 'bulk_update_leads',
    description: 'Update multiple leads at once — e.g. move all unresponsive leads to contacted stage, or set follow-up dates for a group.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter_stage:  { type: 'string', description: 'Only update leads in this stage' },
        filter_search: { type: 'string', description: 'Only update leads matching this search' },
        set_stage:     { type: 'string', enum: ['new','contacted','qualified','demo_scheduled','closed_won','closed_lost'] },
        set_follow_up: { type: 'string', description: 'ISO date to set follow-up for all matched leads' },
        set_do_not_call: { type: 'boolean', description: 'Mark all matched leads as DNC' },
      },
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get a fresh real-time summary of the CRM pipeline — lead counts by stage, follow-ups due, recent activity, and conversion metrics.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'search_members',
    description: 'Search portal members (active clients) by name, email, program, or subscription status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search:  { type: 'string', description: 'Search by name, email, or business' },
        program: { type: 'string', enum: ['program_a','program_b','program_c'] },
        status:  { type: 'string', enum: ['active','inactive','canceled','past_due','trialing'] },
        limit:   { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'update_member',
    description: 'Update a portal member profile — change their program, stage, admin notes, or subscription status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id:          { type: 'string', description: 'Member UUID' },
        assigned_program: { type: 'string', enum: ['program_a','program_b','program_c'] },
        current_stage:    { type: 'string', description: 'Fulfillment stage' },
        admin_notes:      { type: 'string', description: 'Internal admin notes' },
        portal_blocked:   { type: 'boolean', description: 'Block or unblock portal access' },
      },
      required: ['user_id'],
    },
  },
]

// ─── Tool execution ───────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof requireAdmin>>
): Promise<string> {
  if (!supabase) return 'Error: not authorized'

  try {
    if (name === 'search_leads') {
      let query = supabase
        .from('crm_leads')
        .select('id, first_name, last_name, phone, email, business_name, stage, program_interest, notes, follow_up_at, last_contacted_at, do_not_call')
        .eq('is_archived', false)
        .eq('do_not_call', false)

      if (input.stage)   query = query.eq('stage', input.stage)
      if (input.program) query = query.eq('program_interest', input.program)
      if (input.follow_up_due) query = query.lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
      if (input.search) {
        const s = `%${input.search}%`
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},business_name.ilike.${s},phone.ilike.${s}`)
      }
      query = query.order('created_at', { ascending: false }).limit((input.limit as number) ?? 20)

      const { data, error } = await query
      if (error) return `Error: ${error.message}`
      if (!data?.length) return 'No leads found matching those filters.'
      return JSON.stringify(data, null, 2)
    }

    if (name === 'get_lead') {
      let query = supabase.from('crm_leads').select('*')
      if (input.lead_id) query = query.eq('id', input.lead_id)
      else if (input.phone) query = query.eq('phone', input.phone)
      else return 'Error: provide lead_id or phone'
      const { data, error } = await query.single()
      if (error || !data) return 'Lead not found.'
      return JSON.stringify(data, null, 2)
    }

    if (name === 'update_lead') {
      const { lead_id, ...fields } = input
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (fields.stage !== undefined)             update.stage = fields.stage
      if (fields.notes !== undefined)             update.notes = fields.notes
      if (fields.follow_up_at !== undefined)      update.follow_up_at = fields.follow_up_at
      if (fields.do_not_call !== undefined)       update.do_not_call = fields.do_not_call
      if (fields.program_interest !== undefined)  update.program_interest = fields.program_interest
      if (fields.last_contacted_at !== undefined) update.last_contacted_at = fields.last_contacted_at

      const { data, error } = await supabase
        .from('crm_leads').update(update).eq('id', lead_id as string).select('first_name, last_name, stage').single()
      if (error) return `Error: ${error.message}`
      return `Updated ${data?.first_name} ${data?.last_name} — stage: ${data?.stage}`
    }

    if (name === 'log_activity') {
      const { error } = await supabase.from('crm_activities').insert({
        lead_id:    input.lead_id,
        type:       input.type,
        body:       input.body,
        created_by: 'Admin AI',
        metadata:   { source: 'admin_ai' },
      })
      if (error) return `Error: ${error.message}`
      return `Activity logged: [${input.type}] ${input.body}`
    }

    if (name === 'bulk_update_leads') {
      let query = supabase.from('crm_leads').select('id, first_name, last_name').eq('is_archived', false)
      if (input.filter_stage)  query = query.eq('stage', input.filter_stage)
      if (input.filter_search) {
        const s = `%${input.filter_search}%`
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},business_name.ilike.${s}`)
      }
      const { data: leads } = await query

      if (!leads?.length) return 'No leads matched the filter.'

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.set_stage)       update.stage = input.set_stage
      if (input.set_follow_up)   update.follow_up_at = input.set_follow_up
      if (input.set_do_not_call) update.do_not_call = input.set_do_not_call

      const ids = leads.map(l => l.id)
      const { error } = await supabase.from('crm_leads').update(update).in('id', ids)
      if (error) return `Error: ${error.message}`
      return `Updated ${leads.length} leads successfully.`
    }

    if (name === 'get_pipeline_summary') {
      const [{ data: leads }, { data: activities }] = await Promise.all([
        supabase.from('crm_leads').select('stage, do_not_call, follow_up_at').eq('is_archived', false),
        supabase.from('crm_activities').select('type, created_at').order('created_at', { ascending: false }).limit(20),
      ])
      const stageCount = (leads ?? []).reduce<Record<string, number>>((a, l) => { a[l.stage] = (a[l.stage]??0)+1; return a }, {})
      const dueCount = (leads ?? []).filter(l => l.follow_up_at && new Date(l.follow_up_at) <= new Date()).length
      const dncCount = (leads ?? []).filter(l => l.do_not_call).length
      return JSON.stringify({ total: leads?.length, by_stage: stageCount, follow_ups_due: dueCount, dnc: dncCount, recent_activities: activities?.length }, null, 2)
    }

    if (name === 'search_members') {
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, business_name, assigned_program, subscription_status, current_stage, created_at')
        .eq('is_admin', false)

      if (input.program) query = query.eq('assigned_program', input.program)
      if (input.status)  query = query.eq('subscription_status', input.status)
      if (input.search) {
        const s = `%${input.search}%`
        query = query.or(`full_name.ilike.${s},email.ilike.${s},business_name.ilike.${s}`)
      }
      query = query.order('created_at', { ascending: false }).limit((input.limit as number) ?? 10)
      const { data, error } = await query
      if (error) return `Error: ${error.message}`
      if (!data?.length) return 'No members found.'
      return JSON.stringify(data, null, 2)
    }

    if (name === 'update_member') {
      const { user_id, ...fields } = input
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (fields.assigned_program !== undefined) update.assigned_program = fields.assigned_program
      if (fields.current_stage    !== undefined) update.current_stage    = fields.current_stage
      if (fields.admin_notes      !== undefined) update.admin_notes      = fields.admin_notes
      if (fields.portal_blocked   !== undefined) update.portal_blocked   = fields.portal_blocked

      const { data, error } = await supabase
        .from('profiles').update(update).eq('id', user_id as string).select('full_name').single()
      if (error) return `Error: ${error.message}`
      return `Updated member ${data?.full_name} successfully.`
    }

    return `Unknown tool: ${name}`
  } catch (err) {
    return `Tool error: ${String(err)}`
  }
}

// ─── POST /api/admin/agent ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ message: 'AI not configured' }, { status: 503 })

  const { messages, page_context } = await req.json() as {
    messages: { role: string; content: string }[]
    page_context?: { page?: string; label?: string }
  }

  // ─── Load live context snapshot ───────────────────────────────────────────
  const [leadsResult, membersResult, followUpsResult] = await Promise.all([
    supabase.from('crm_leads').select('stage, do_not_call, follow_up_at').eq('is_archived', false),
    supabase.from('profiles').select('subscription_status, assigned_program').eq('is_admin', false),
    supabase.from('crm_leads').select('first_name, last_name, phone, follow_up_at, stage')
      .eq('is_archived', false).eq('do_not_call', false)
      .lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
      .order('follow_up_at').limit(5),
  ])

  const leads   = leadsResult.data ?? []
  const members = membersResult.data ?? []
  const dueNow  = followUpsResult.data ?? []

  const stageCount = leads.reduce<Record<string, number>>((a, l) => { a[l.stage]=(a[l.stage]??0)+1; return a }, {})
  const activeCount = members.filter(m => m.subscription_status === 'active' || m.subscription_status === 'trialing').length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const systemPrompt = `You are Abel's personal Admin AI for SourcifyLending — an agentic assistant with direct access to take actions inside the CRM, member portal, and business data.

You are NOT just a chatbot. You TAKE ACTION. When Abel asks you to update a lead, move a stage, log a call, filter contacts, or update a member — you DO IT using your tools. Don't ask for confirmation unless the action is irreversible (like bulk DNC). Just act and report what you did.

Today: ${today}
Current page: ${page_context?.label ?? 'Admin Portal'}

════════════════════════════════════════
LIVE SNAPSHOT
════════════════════════════════════════
CRM Pipeline (${leads.length} active leads):
${Object.entries(stageCount).map(([s,n])=>`  • ${s}: ${n}`).join('\n')||'  empty'}

Follow-ups due right now (${dueNow.length}):
${dueNow.map(l=>`  • ${l.first_name} ${l.last_name} — ${l.phone}`).join('\n')||'  none'}

Members: ${members.length} total | ${activeCount} active

════════════════════════════════════════
BEHAVIOR RULES
════════════════════════════════════════
1. When asked to DO something — use your tools immediately. Don't explain, just act.
2. After acting, give a SHORT confirmation of what you did (1–3 lines).
3. When asked to FIND something — use search tools, then present results cleanly.
4. Proactively flag issues you notice (overdue follow-ups, stale leads, billing problems).
5. For bulk actions affecting many leads, confirm the count first then ask to proceed.
6. Keep responses short. Use bold for names/numbers. Skip filler words.
7. You have full read/write access to CRM leads, activities, and member profiles.
8. Never make up data — always fetch fresh data from tools when needed.

════════════════════════════════════════
TOOLS AVAILABLE
════════════════════════════════════════
- search_leads: filter/find leads by any criteria
- get_lead: get full lead details
- update_lead: change stage, notes, follow-up, DNC, program
- log_activity: log calls, notes, emails on a lead
- bulk_update_leads: update many leads at once
- get_pipeline_summary: fresh pipeline metrics
- search_members: find portal members
- update_member: update member program, stage, notes, access`

  // ─── Agentic loop ─────────────────────────────────────────────────────────
  const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  let finalText = ''
  const MAX_ITERATIONS = 8

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: apiMessages,
    })

    // Collect any text content
    const textBlocks = response.content.filter(b => b.type === 'text')
    if (textBlocks.length) {
      finalText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('\n')
    }

    // If no tool calls, we're done
    if (response.stop_reason === 'end_turn') break

    // Process tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
    if (!toolUseBlocks.length) break

    // Add assistant message with all content blocks
    apiMessages.push({ role: 'assistant', content: response.content })

    // Execute all tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const toolBlock = block as Anthropic.ToolUseBlock
      const result = await executeTool(toolBlock.name, toolBlock.input as Record<string, unknown>, supabase)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result,
      })
    }

    // Add tool results and continue loop
    apiMessages.push({ role: 'user', content: toolResults })
  }

  return NextResponse.json({ message: finalText || 'Done.' })
}
