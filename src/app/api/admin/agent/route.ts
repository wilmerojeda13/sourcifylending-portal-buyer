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

export async function POST(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ message: 'AI not configured' }, { status: 503 })

  const { messages, page_context } = await req.json() as {
    messages: { role: string; content: string }[]
    page_context?: { page?: string; label?: string }
  }

  // ─── Fetch admin context in parallel ──────────────────────────────────────
  const [
    crmLeadsResult,
    crmActivitiesResult,
    membersResult,
    followUpResult,
    dncResult,
    recentMembersResult,
  ] = await Promise.all([
    // CRM: leads by stage
    supabase
      .from('crm_leads')
      .select('stage, do_not_call, is_archived, follow_up_at, last_contacted_at, first_name, last_name, business_name, phone')
      .eq('is_archived', false),

    // CRM: recent activities (last 10)
    supabase
      .from('crm_activities')
      .select('type, body, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(10),

    // Members: all profiles with key fields
    supabase
      .from('profiles')
      .select('full_name, business_name, subscription_status, assigned_program, created_at, is_admin')
      .eq('is_admin', false),

    // CRM: follow-ups due today or overdue
    supabase
      .from('crm_leads')
      .select('first_name, last_name, business_name, phone, follow_up_at, stage')
      .eq('is_archived', false)
      .eq('do_not_call', false)
      .lte('follow_up_at', new Date().toISOString())
      .not('follow_up_at', 'is', null)
      .order('follow_up_at')
      .limit(10),

    // CRM: DNC count
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('do_not_call', true),

    // Members: most recent signups
    supabase
      .from('profiles')
      .select('full_name, business_name, assigned_program, subscription_status, created_at')
      .eq('is_admin', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const leads       = crmLeadsResult.data ?? []
  const activities  = crmActivitiesResult.data ?? []
  const members     = membersResult.data ?? []
  const followUps   = followUpResult.data ?? []
  const dncCount    = dncResult.count ?? 0
  const recentMems  = recentMembersResult.data ?? []

  // ─── Compute CRM stats ────────────────────────────────────────────────────
  const stageCount = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.stage] = (acc[l.stage] ?? 0) + 1
    return acc
  }, {})

  // ─── Compute member stats ─────────────────────────────────────────────────
  const activeMembers   = members.filter(m => m.subscription_status === 'active' || m.subscription_status === 'trialing')
  const canceledMembers = members.filter(m => m.subscription_status === 'canceled')
  const programBreakdown = members.reduce<Record<string, number>>((acc, m) => {
    if (m.assigned_program) acc[m.assigned_program] = (acc[m.assigned_program] ?? 0) + 1
    return acc
  }, {})

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // ─── Build system prompt ──────────────────────────────────────────────────
  const systemPrompt = `You are Abel's personal Admin AI for SourcifyLending — a business credit and funding company.
You have FULL visibility into the CRM, member base, pipeline, and activities. You are an advisor, analyst, and assistant rolled into one.
Today is ${today}.
Current page: ${page_context?.label ?? 'Admin Portal'}

════════════════════════════════════════
RESPONSE RULES
════════════════════════════════════════
- Be direct, sharp, and concise. Abel is busy — no fluff.
- Default to short responses (3–8 lines). Expand only when asked.
- Use bullet points and bold for scannability.
- Be proactive: flag issues, patterns, and opportunities without being asked.
- Refer to Abel by name occasionally. You know him well.
- Never make up data — only use the context below.
- When suggesting actions, be specific (names, numbers, next steps).

════════════════════════════════════════
CRM PIPELINE — LIVE DATA
════════════════════════════════════════
Total active leads: ${leads.length} | DNC: ${dncCount}

Stage breakdown:
${Object.entries(stageCount).map(([s, n]) => `  • ${s}: ${n}`).join('\n') || '  (no leads)'}

Follow-ups due/overdue (${followUps.length}):
${followUps.length > 0
  ? followUps.map(l => `  • ${l.first_name} ${l.last_name}${l.business_name ? ` (${l.business_name})` : ''} — ${l.phone} — due ${new Date(l.follow_up_at).toLocaleDateString()}`).join('\n')
  : '  None due right now.'}

Recent CRM activities:
${activities.map(a => `  • [${a.type}] ${a.body ?? ''} — ${new Date(a.created_at).toLocaleDateString()}`).join('\n') || '  No recent activity.'}

════════════════════════════════════════
MEMBER BASE — LIVE DATA
════════════════════════════════════════
Total members: ${members.length} | Active: ${activeMembers.length} | Canceled: ${canceledMembers.length}

Program breakdown:
  • Program A (0% APR): ${programBreakdown['program_a'] ?? 0}
  • Program B (Business Credit Builder): ${programBreakdown['program_b'] ?? 0}
  • Program C (Capital Monitoring): ${programBreakdown['program_c'] ?? 0}

Recent signups:
${recentMems.map(m => `  • ${m.full_name ?? 'Unknown'}${m.business_name ? ` — ${m.business_name}` : ''} (${m.assigned_program ?? 'no program'}, ${m.subscription_status}) — joined ${new Date(m.created_at).toLocaleDateString()}`).join('\n') || '  No recent signups.'}

════════════════════════════════════════
YOUR BUSINESS CONTEXT
════════════════════════════════════════
SourcifyLending offers 3 programs:
- Program A: Personal credit — 0% intro APR card strategy
- Program B: Business credit builder — D-U-N-S, vendor tradelines, business cards, fleet credit
- Program C: Capital monitoring — bureau monitoring, credit health alerts

Sales process: Cold outreach → Qualify → Book demo → Close
Voice campaigns run via Twilio + VAPI (Sarah AI agent)
CRM is internal-only — separate from member portal`

  // ─── Call Claude Opus ─────────────────────────────────────────────────────
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message: text })
  } catch (err) {
    console.error('[AdminAgent]', err)
    return NextResponse.json({ message: 'AI temporarily unavailable. Try again.' })
  }
}
