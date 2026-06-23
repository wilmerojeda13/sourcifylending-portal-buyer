import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getOpenAIDiagnostic, getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from '@/lib/openai'

export const dynamic = 'force-dynamic'

function logAdminAI(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown> = {}) {
  const payload = {
    scope: 'api/admin/agent',
    timestamp: new Date().toISOString(),
    ...meta,
  }
  if (level === 'info') console.info(`[ADMIN-AI] ${message}`, payload)
  else if (level === 'warn') console.warn(`[ADMIN-AI] ${message}`, payload)
  else console.error(`[ADMIN-AI] ${message}`, payload)
}

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
const TOOLS: Array<{
  name: string
  description: string
  input_schema: Record<string, unknown>
}> = [
  // ── CRM ──
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
        filter_stage:    { type: 'string', description: 'Only update leads in this stage' },
        filter_search:   { type: 'string', description: 'Only update leads matching this search' },
        set_stage:       { type: 'string', enum: ['new','contacted','qualified','demo_scheduled','closed_won','closed_lost'] },
        set_follow_up:   { type: 'string', description: 'ISO date to set follow-up for all matched leads' },
        set_do_not_call: { type: 'boolean', description: 'Mark all matched leads as DNC' },
      },
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get a fresh real-time summary of the CRM pipeline — lead counts by stage, follow-ups due, recent activity, and conversion metrics.',
    input_schema: { type: 'object' as const, properties: {} },
  },

  // ── Members ──
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

  // ── Support ──
  {
    name: 'get_support_tickets',
    description: 'Get support tickets/messages. Filter by status (open, replied, closed). Returns user email, subject, message, status, and creation date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['open','replied','closed'], description: 'Filter by ticket status' },
        limit:  { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'reply_support_ticket',
    description: 'Reply to a support ticket. Sets the admin_reply text and marks the ticket as replied. This triggers a notification email to the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticket_id: { type: 'string', description: 'Support message UUID' },
        reply:     { type: 'string', description: 'The reply text to send to the user' },
      },
      required: ['ticket_id', 'reply'],
    },
  },

  // ── Training ──
  {
    name: 'get_training_videos',
    description: 'List training videos from the portal. Returns title, description, category, program, published status, and sort order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category:     { type: 'string', description: 'Filter by category' },
        program:      { type: 'string', description: 'Filter by program (all, program_a, program_b, program_c)' },
        published_only: { type: 'boolean', description: 'If true, only return published videos' },
        limit:        { type: 'number', description: 'Max results (default 30)' },
      },
    },
  },
  {
    name: 'search_training_content',
    description: 'Search training videos by keyword in title or description. Use this when the operator asks if we have a video about a specific topic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: 'Search term to look for in video titles and descriptions' },
      },
      required: ['keyword'],
    },
  },

  // ── Revenue ──
  {
    name: 'get_revenue_summary',
    description: 'Get a revenue and billing summary. Returns active subscription count, MRR, billing status breakdown, past_due count, and recent payment activity.',
    input_schema: { type: 'object' as const, properties: {} },
  },

  // ── Affiliates ──
  {
    name: 'get_affiliate_summary',
    description: 'Get an affiliate program summary — total affiliates by status, pending commissions, recent signups, and top performers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['active','pending','suspended','rejected'], description: 'Filter by affiliate status' },
      },
    },
  },

  // ── Voice ──
  {
    name: 'get_voice_summary',
    description: 'Get voice campaign summary — campaign count by status, total calls, connect rates, and recent call outcomes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Optional: get summary for a specific campaign' },
      },
    },
  },

  // ── Operations ──
  {
    name: 'get_operations_summary',
    description: 'Get operations overview — client health breakdown (at_risk, needs_attention, good), task completion rates, and recent activity.',
    input_schema: { type: 'object' as const, properties: {} },
  },
]

const OPENAI_TOOLS = TOOLS.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}))

// ─── Tool execution ───────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof requireAdmin>>
): Promise<string> {
  if (!supabase) return 'Error: not authorized'

  try {
    // ── CRM ──
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

    // ── Members ──
    if (name === 'search_members') {
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, business_name, assigned_program, billing_status, current_stage, created_at')
        .eq('is_admin', false)

      if (input.program) query = query.eq('assigned_program', input.program)
      if (input.status)  query = query.eq('billing_status', input.status)
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

    // ── Support ──
    if (name === 'get_support_tickets') {
      try {
        let query = supabase
          .from('support_messages')
          .select('id, user_id, user_email, subject, message, status, admin_reply, created_at')
          .order('created_at', { ascending: false })
          .limit((input.limit as number) ?? 20)

        if (input.status) query = query.eq('status', input.status)

        const { data, error } = await query
        if (error) return `Error: ${error.message}`
        if (!data?.length) return 'No support tickets found.'

        // Truncate long messages for readability
        const truncated = data.map(t => ({
          ...t,
          message: t.message?.length > 200 ? t.message.substring(0, 200) + '...' : t.message,
        }))
        return JSON.stringify(truncated, null, 2)
      } catch (err) {
        return `Support data not available: ${String(err)}`
      }
    }

    if (name === 'reply_support_ticket') {
      try {
        const { data, error } = await supabase
          .from('support_messages')
          .update({
            admin_reply: input.reply,
            status: 'replied',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.ticket_id as string)
          .select('id, subject, user_email')
          .single()

        if (error) return `Error: ${error.message}`
        return `Replied to ticket "${data?.subject}" (${data?.user_email}). Status set to replied.`
      } catch (err) {
        return `Failed to reply to ticket: ${String(err)}`
      }
    }

    // ── Training ──
    if (name === 'get_training_videos') {
      try {
        let query = supabase
          .from('training_videos')
          .select('id, title, description, category, program, is_published, sort_order, duration, created_at')
          .order('sort_order', { ascending: true })
          .limit((input.limit as number) ?? 30)

        if (input.category)      query = query.eq('category', input.category)
        if (input.program)       query = query.eq('program', input.program)
        if (input.published_only) query = query.eq('is_published', true)

        const { data, error } = await query
        if (error) return `Error: ${error.message}`
        if (!data?.length) return 'No training videos found.'
        return JSON.stringify(data, null, 2)
      } catch (err) {
        return `Training data not available: ${String(err)}`
      }
    }

    if (name === 'search_training_content') {
      try {
        const keyword = input.keyword as string
        const s = `%${keyword}%`
        const { data, error } = await supabase
          .from('training_videos')
          .select('id, title, description, category, program, is_published')
          .or(`title.ilike.${s},description.ilike.${s}`)
          .order('sort_order', { ascending: true })
          .limit(10)

        if (error) return `Error: ${error.message}`
        if (!data?.length) return `No training videos found matching "${keyword}".`
        return JSON.stringify(data, null, 2)
      } catch (err) {
        return `Training search not available: ${String(err)}`
      }
    }

    // ── Revenue ──
    if (name === 'get_revenue_summary') {
      try {
        const [subsResult, paymentsResult] = await Promise.all([
          supabase.from('subscriptions')
            .select('user_id, billing_status, access_status, monthly_fee_standard, setup_fee_standard, setup_fee_paid'),
          supabase.from('payment_records')
            .select('amount, payment_type, payment_status, payment_date')
            .order('payment_date', { ascending: false })
            .limit(50),
        ])

        const subs = subsResult.data ?? []
        const payments = paymentsResult.data ?? []

        const activeCount   = subs.filter(s => s.access_status === 'active').length
        const pastDueCount  = subs.filter(s => s.billing_status === 'past_due').length
        const trialingCount = subs.filter(s => s.access_status === 'trialing').length
        const canceledCount = subs.filter(s => s.access_status === 'canceled').length

        const mrr = subs
          .filter(s => s.access_status === 'active' && Number(s.monthly_fee_standard) > 0)
          .reduce((sum, s) => sum + (Number(s.monthly_fee_standard) || 0), 0)

        const currentMonth = new Date().toISOString().slice(0, 7)
        const thisMonthRevenue = payments
          .filter(p => (p.payment_status === 'paid' || p.payment_status == null) && typeof p.payment_date === 'string' && p.payment_date.startsWith(currentMonth))
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

        const recentPayments = payments.slice(0, 10).map(p => ({
          amount: p.amount,
          type: p.payment_type,
          status: p.payment_status || 'paid',
          date: p.payment_date,
        }))

        return JSON.stringify({
          subscriptions: { active: activeCount, past_due: pastDueCount, trialing: trialingCount, canceled: canceledCount },
          mrr_estimate: mrr,
          this_month_revenue: thisMonthRevenue,
          recent_payments: recentPayments,
        }, null, 2)
      } catch (err) {
        return `Revenue data not available: ${String(err)}`
      }
    }

    // ── Affiliates ──
    if (name === 'get_affiliate_summary') {
      try {
        let query = supabase
          .from('affiliates')
          .select('id, name, email, status, referral_code, created_at')
          .order('created_at', { ascending: false })
          .limit(100)

        if (input.status) query = query.eq('status', input.status)

        const { data: affiliates, error } = await query
        if (error) return `Error: ${error.message}`

        const byStatus = (affiliates ?? []).reduce<Record<string, number>>((acc, a) => {
          const s = a.status ?? 'unknown'
          acc[s] = (acc[s] ?? 0) + 1
          return acc
        }, {})

        // Get pending commissions total
        const { data: commissions } = await supabase
          .from('affiliate_commissions')
          .select('commission_amount, status, affiliate_id')
          .eq('status', 'approved')

        const pendingTotal = (commissions ?? []).reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0)
        const affiliatesWithPending = new Set((commissions ?? []).map(c => c.affiliate_id)).size

        const recentSignups = (affiliates ?? []).slice(0, 5).map(a => ({ name: a.name, email: a.email, status: a.status, joined: a.created_at }))

        return JSON.stringify({
          total: affiliates?.length ?? 0,
          by_status: byStatus,
          pending_commissions_total: pendingTotal,
          affiliates_with_pending_payout: affiliatesWithPending,
          recent_signups: recentSignups,
        }, null, 2)
      } catch (err) {
        return `Affiliate data not available: ${String(err)}`
      }
    }

    // ── Voice ──
    if (name === 'get_voice_summary') {
      try {
        let campaignQuery = supabase
          .from('voice_campaigns')
          .select('id, name, status, total_leads, total_calls, total_connects, created_at')
          .order('created_at', { ascending: false })

        if (input.campaign_id) campaignQuery = campaignQuery.eq('id', input.campaign_id)

        const { data: campaigns, error: campError } = await campaignQuery.limit(20)
        if (campError) return `Error fetching campaigns: ${campError.message}`

        const byStatus = (campaigns ?? []).reduce<Record<string, number>>((acc, c) => {
          const s = c.status ?? 'unknown'
          acc[s] = (acc[s] ?? 0) + 1
          return acc
        }, {})

        const totalCalls    = (campaigns ?? []).reduce((sum, c) => sum + (c.total_calls ?? 0), 0)
        const totalConnects = (campaigns ?? []).reduce((sum, c) => sum + (c.total_connects ?? 0), 0)
        const connectRate   = totalCalls > 0 ? ((totalConnects / totalCalls) * 100).toFixed(1) : '0.0'

        // Get recent call outcomes
        const { data: recentCalls } = await supabase
          .from('voice_calls')
          .select('status, disposition, duration_seconds, created_at')
          .order('created_at', { ascending: false })
          .limit(50)

        const dispositionCounts = (recentCalls ?? []).reduce<Record<string, number>>((acc, c) => {
          const d = c.disposition ?? 'unknown'
          acc[d] = (acc[d] ?? 0) + 1
          return acc
        }, {})

        return JSON.stringify({
          campaigns: {
            total: campaigns?.length ?? 0,
            by_status: byStatus,
            list: input.campaign_id ? campaigns : (campaigns ?? []).slice(0, 5),
          },
          calls: {
            total_all_campaigns: totalCalls,
            total_connects: totalConnects,
            connect_rate_pct: connectRate,
            recent_dispositions: dispositionCounts,
          },
        }, null, 2)
      } catch (err) {
        return `Voice data not available: ${String(err)}`
      }
    }

    // ── Operations ──
    if (name === 'get_operations_summary') {
      try {
        const [profilesResult, tasksResult, activityResult] = await Promise.all([
          supabase.from('profiles')
            .select('id, full_name, billing_status, current_stage, progress_percentage, portal_blocked, created_at')
            .eq('is_admin', false)
            .eq('is_demo', false),
          supabase.from('tasks').select('user_id, status'),
          supabase.from('activity_logs')
            .select('user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        ])

        const profiles   = profilesResult.data ?? []
        const tasks      = tasksResult.data ?? []
        const actLogs    = activityResult.data ?? []

        // Build activity map (last activity per user)
        const activityMap = new Map<string, string>()
        for (const log of actLogs) {
          if (!activityMap.has(log.user_id)) activityMap.set(log.user_id, log.created_at)
        }

        // Task map
        const taskMap = new Map<string, { completed: number; total: number }>()
        for (const t of tasks) {
          const existing = taskMap.get(t.user_id) ?? { completed: 0, total: 0 }
          existing.total++
          if (t.status === 'completed') existing.completed++
          taskMap.set(t.user_id, existing)
        }

        const now = Date.now()
        const DAY_MS = 86_400_000
        let atRisk = 0, needsAttention = 0, good = 0

        for (const p of profiles) {
          const isActive = ['active','trialing'].includes(p.billing_status ?? '')
          const lastActivity = activityMap.get(p.id)
          const lastMs = lastActivity ? new Date(lastActivity).getTime() : null
          const daysSince = lastMs ? (now - lastMs) / DAY_MS : null
          const joinedDays = (now - new Date(p.created_at).getTime()) / DAY_MS
          const progress = p.progress_percentage ?? 0

          if ((daysSince === null || daysSince >= 7) && isActive || (progress < 10 && joinedDays >= 14)) {
            atRisk++
          } else if ((daysSince !== null && daysSince >= 3 && daysSince < 7) || (progress < 30 && joinedDays >= 7)) {
            needsAttention++
          } else {
            good++
          }
        }

        const totalTasks     = tasks.length
        const completedTasks = tasks.filter(t => t.status === 'completed').length
        const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0.0'

        const activeMembers = profiles.filter(p => ['active','trialing'].includes(p.billing_status ?? '')).length
        const blockedCount  = profiles.filter(p => p.portal_blocked).length

        return JSON.stringify({
          client_health: { at_risk: atRisk, needs_attention: needsAttention, good },
          total_clients: profiles.length,
          active_members: activeMembers,
          portal_blocked: blockedCount,
          tasks: { total: totalTasks, completed: completedTasks, completion_rate_pct: completionRate },
        }, null, 2)
      } catch (err) {
        return `Operations data not available: ${String(err)}`
      }
    }

    return `Unknown tool: ${name}`
  } catch (err) {
    return `Tool error: ${String(err)}`
  }
}

// ─── POST /api/admin/agent ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const supabase = await requireAdmin()
  if (!supabase) {
    logAdminAI('warn', 'forbidden admin request', { requestId })
    return NextResponse.json({ error: 'Forbidden', request_id: requestId }, { status: 403 })
  }
  if (!isOpenAIConfigured()) {
    logAdminAI('error', 'OPENAI_API_KEY_MISSING', { requestId, diagnostic_code: 'OPENAI_API_KEY_MISSING' })
    return NextResponse.json({ message: 'AI is temporarily unavailable. Please try again shortly.', error_code: 'OPENAI_API_KEY_MISSING', request_id: requestId }, { status: 503 })
  }

  const { messages, page_context, context_id, context_type } = await req.json() as {
    messages: { role: string; content: string }[]
    page_context?: { page?: string; label?: string }
    context_id?: string | null
    context_type?: 'member' | 'lead' | 'affiliate' | 'voice_campaign' | null
  }

  // ─── Fetch page context if present ────────────────────────────────────────
  let pageContextBlock = ''
  if (context_id && context_type) {
    try {
      if (context_type === 'member') {
        const { data: m } = await supabase
          .from('profiles')
          .select('id, full_name, email, business_name, assigned_program, billing_status, current_stage, admin_notes, readiness_status, uw_risk_score, uw_approval_likelihood, underwriting_completed_at, underwriting_next_due_at, portal_blocked, created_at')
          .eq('id', context_id)
          .single()
        if (m) {
          pageContextBlock = `
=== CURRENT PAGE: Admin is viewing ${m.full_name ?? 'Unknown'} ===
Type: Member
ID: ${m.id}
Email: ${m.email ?? 'N/A'}
Business: ${m.business_name ?? 'N/A'}
Program: ${m.assigned_program ?? 'None'}
Status: ${m.billing_status ?? 'N/A'}
Stage: ${m.current_stage ?? 'N/A'}
Readiness: ${m.readiness_status ?? 'N/A'}
Risk Score: ${m.uw_risk_score ?? 'N/A'}
Approval Likelihood: ${m.uw_approval_likelihood ?? 'N/A'}
Portal Blocked: ${m.portal_blocked ? 'Yes' : 'No'}
Admin Notes: ${m.admin_notes ?? 'None'}
Member Since: ${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}
Underwriting Next Due: ${m.underwriting_next_due_at ? new Date(m.underwriting_next_due_at).toLocaleDateString() : 'N/A'}
===
`
        }
      } else if (context_type === 'lead') {
        const { data: l } = await supabase
          .from('crm_leads')
          .select('id, first_name, last_name, email, phone, business_name, stage, program_interest, notes, follow_up_at, last_contacted_at, do_not_call, created_at')
          .eq('id', context_id)
          .single()
        if (l) {
          pageContextBlock = `
=== CURRENT PAGE: Admin is viewing ${l.first_name ?? ''} ${l.last_name ?? ''} ===
Type: Lead
ID: ${l.id}
Email: ${l.email ?? 'N/A'}
Phone: ${l.phone ?? 'N/A'}
Business: ${l.business_name ?? 'N/A'}
Stage: ${l.stage ?? 'N/A'}
Program Interest: ${l.program_interest ?? 'N/A'}
Do Not Call: ${l.do_not_call ? 'Yes' : 'No'}
Follow-up At: ${l.follow_up_at ? new Date(l.follow_up_at).toLocaleDateString() : 'N/A'}
Last Contacted: ${l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleDateString() : 'N/A'}
Notes: ${l.notes ?? 'None'}
Lead Since: ${l.created_at ? new Date(l.created_at).toLocaleDateString() : 'N/A'}
===
`
        }
      } else if (context_type === 'affiliate') {
        const { data: a } = await supabase
          .from('affiliates')
          .select('id, name, email, status, referral_code, notes, created_at')
          .eq('id', context_id)
          .single()
        if (a) {
          // Get their commissions
          const { data: comms } = await supabase
            .from('affiliate_commissions')
            .select('commission_amount, status')
            .eq('affiliate_id', context_id)

          const totalEarned  = (comms ?? []).filter(c => c.status !== 'reversed').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0)
          const pendingPayout = (comms ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0)

          pageContextBlock = `
=== CURRENT PAGE: Admin is viewing affiliate ${a.name ?? 'Unknown'} ===
Type: Affiliate
ID: ${a.id}
Email: ${a.email ?? 'N/A'}
Status: ${a.status ?? 'N/A'}
Referral Code: ${a.referral_code ?? 'N/A'}
Total Earned: $${totalEarned.toFixed(2)}
Pending Payout: $${pendingPayout.toFixed(2)}
Notes: ${a.notes ?? 'None'}
Affiliate Since: ${a.created_at ? new Date(a.created_at).toLocaleDateString() : 'N/A'}
===
`
        }
      } else if (context_type === 'voice_campaign') {
        const { data: vc } = await supabase
          .from('voice_campaigns')
          .select('id, name, status, total_leads, total_calls, total_connects, created_at')
          .eq('id', context_id)
          .single()
        if (vc) {
          const connectRate = vc.total_calls > 0 ? ((vc.total_connects / vc.total_calls) * 100).toFixed(1) : '0.0'
          pageContextBlock = `
=== CURRENT PAGE: Admin is viewing campaign "${vc.name ?? 'Unknown'}" ===
Type: Voice Campaign
ID: ${vc.id}
Status: ${vc.status ?? 'N/A'}
Total Leads: ${vc.total_leads ?? 0}
Total Calls: ${vc.total_calls ?? 0}
Total Connects: ${vc.total_connects ?? 0}
Connect Rate: ${connectRate}%
Created: ${vc.created_at ? new Date(vc.created_at).toLocaleDateString() : 'N/A'}
===
`
        }
      }
    } catch (err) {
      console.error('[admin/agent] Failed to fetch page context:', err)
    }
  }

  // ─── Load live context snapshot ───────────────────────────────────────────
  const [leadsResult, membersResult, followUpsResult, supportResult, subsResult, affiliatesResult] = await Promise.all([
    supabase.from('crm_leads').select('stage, do_not_call, follow_up_at').eq('is_archived', false),
    supabase.from('profiles').select('billing_status, assigned_program').eq('is_admin', false),
    supabase.from('crm_leads').select('first_name, last_name, phone, follow_up_at, stage')
      .eq('is_archived', false).eq('do_not_call', false)
      .lte('follow_up_at', new Date().toISOString()).not('follow_up_at', 'is', null)
      .order('follow_up_at').limit(5),
    supabase.from('support_messages').select('status').eq('status', 'open'),
    supabase.from('subscriptions').select('access_status, billing_status'),
    supabase.from('affiliates').select('status').limit(500),
  ])

  const leads       = leadsResult.data ?? []
  const members     = membersResult.data ?? []
  const dueNow      = followUpsResult.data ?? []
  const openTickets = supportResult.data ?? []
  const subs        = subsResult.data ?? []
  const affiliates  = affiliatesResult.data ?? []

  const stageCount  = leads.reduce<Record<string, number>>((a, l) => { a[l.stage]=(a[l.stage]??0)+1; return a }, {})
  const activeCount = members.filter(m => m.billing_status === 'active' || m.billing_status === 'trialing').length
  const pastDueCount = subs.filter(s => s.billing_status === 'past_due').length
  const activeSubCount = subs.filter(s => s.access_status === 'active').length
  const activeAffCount = affiliates.filter(a => a.status === 'active').length

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const systemPrompt = `${pageContextBlock}You are the Admin AI for SourcifyLending — an agentic assistant with FULL access to every part of the admin portal.

You follow the operator everywhere: CRM, Members, Support, Training, Voice Campaigns, Affiliates, Revenue, Operations. You know exactly which page they are on and what they are looking at.

You TAKE ACTION. You don't ask "would you like me to...?" — you just DO it and report back.

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
Support: ${openTickets.length} open tickets
Revenue: ${activeSubCount} active subscriptions | ${pastDueCount} past_due
Affiliates: ${activeAffCount} active affiliates (${affiliates.length} total)

════════════════════════════════════════
BEHAVIOR RULES
════════════════════════════════════════
1. When asked to DO something — use your tools immediately. Don't explain, just act.
2. After acting, give a SHORT confirmation of what you did (1–3 lines).
3. When asked to FIND something — use search tools, then present results cleanly.
4. Proactively flag issues you notice (overdue follow-ups, stale leads, billing problems, open tickets).
5. For bulk actions affecting many leads, confirm the count first then ask to proceed.
6. Keep responses short. Use bold for names/numbers. Skip filler words.
7. You have full read/write access to ALL business data.
8. Never make up data — always fetch fresh data from tools when needed.

════════════════════════════════════════
TOOLS AVAILABLE
════════════════════════════════════════
CRM:
  - search_leads: filter/find leads by any criteria
  - get_lead: get full lead details
  - update_lead: change stage, notes, follow-up, DNC, program
  - log_activity: log calls, notes, emails on a lead
  - bulk_update_leads: update many leads at once
  - get_pipeline_summary: fresh pipeline metrics

Members:
  - search_members: find portal members
  - update_member: update member program, stage, notes, access

Support:
  - get_support_tickets: list open/replied/closed tickets
  - reply_support_ticket: send a reply and mark as replied

Training:
  - get_training_videos: list all training videos
  - search_training_content: search videos by keyword

Revenue:
  - get_revenue_summary: MRR, subscription counts, recent payments

Affiliates:
  - get_affiliate_summary: total affiliates, commissions, top performers

Voice:
  - get_voice_summary: campaign stats, call counts, connect rates

Operations:
  - get_operations_summary: client health, task completion, at-risk members`

  // ─── Agentic loop ─────────────────────────────────────────────────────────
  const openai = getOpenAIClient()
  const model = getOpenAIModel()
  const apiMessages: any[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }))

  let finalText = ''
  const MAX_ITERATIONS = 8

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await openai.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...apiMessages,
        ],
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
      })

      const message = response.choices[0]?.message
      if (message?.content) finalText = message.content

      // If no tool calls, we're done
      const toolCalls = message?.tool_calls ?? []
      if (!toolCalls.length) break

      apiMessages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: toolCalls,
      })

      // Execute all tool calls and collect results
      for (const toolCall of toolCalls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          input = {}
        }
        const result = await executeTool(toolCall.function.name, input, supabase)
        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }
    }
  } catch (error) {
    const diagnostic = getOpenAIDiagnostic(error)
    logAdminAI(diagnostic.code === 'OPENAI_RATE_LIMITED' ? 'warn' : 'error', diagnostic.code, {
      requestId,
      diagnostic_code: diagnostic.code,
      openai_status: diagnostic.status,
      model,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) },
    })
    return NextResponse.json(
      {
        message: 'AI is temporarily unavailable. Please try again shortly.',
        error_code: diagnostic.code,
        request_id: requestId,
      },
      { status: 503 }
    )
  }

  return NextResponse.json({ message: finalText || 'Done.' })
}
