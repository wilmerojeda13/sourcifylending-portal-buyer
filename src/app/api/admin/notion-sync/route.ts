import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NOTION_API_KEY = process.env.NOTION_API_KEY
const NOTION_VERSION = '2022-06-28'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) return null
  return supabase
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

// ─── Helper: extract plain text from Notion rich_text array ───────────────────
function plainText(rtArray: { plain_text?: string }[] | undefined): string {
  return rtArray?.map((r) => r.plain_text ?? '').join('') ?? ''
}

// ─── GET /api/admin/notion-sync?user_id=xxx ─────────────────────────────────
// Pull data FROM Notion → portal (updates profiles row)
export async function GET(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!NOTION_API_KEY) return NextResponse.json({ error: 'NOTION_API_KEY not configured' }, { status: 503 })

  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('notion_page_id').eq('id', userId).single()
  if (!profile?.notion_page_id) {
    return NextResponse.json({ error: 'No Notion page linked. Link a Notion page first.' }, { status: 404 })
  }

  // Fetch the Notion page
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${profile.notion_page_id}`, {
    headers: notionHeaders(),
  })
  if (!pageRes.ok) {
    const err = await pageRes.json()
    return NextResponse.json({ error: err.message ?? 'Failed to fetch Notion page' }, { status: pageRes.status })
  }
  const page = await pageRes.json()
  const props = page.properties ?? {}

  // Map Notion properties → portal fields using flexible key matching
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const notionPropsFound = Object.keys(props)
  const fieldsUpdated: string[] = []

  // Admin notes / internal notes
  const notesKey = notionPropsFound.find((k) => /notes|admin.*notes|internal.*notes|crm.*notes/i.test(k))
  if (notesKey && props[notesKey]?.type === 'rich_text') {
    const val = plainText(props[notesKey].rich_text)
    if (val) { updates.admin_notes = val; fieldsUpdated.push('admin_notes') }
  }

  // Current stage
  const stageKey = notionPropsFound.find((k) => /^stage$|current.*stage|program.*stage/i.test(k))
  if (stageKey) {
    const val = props[stageKey]?.select?.name ?? plainText(props[stageKey]?.rich_text)
    if (val) { updates.current_stage = val; fieldsUpdated.push('current_stage') }
  }

  // Program
  const programKey = notionPropsFound.find((k) => /^program$|assigned.*program/i.test(k))
  if (programKey) {
    const raw = props[programKey]?.select?.name ?? plainText(props[programKey]?.rich_text)
    if (raw) {
      const normalized = raw.toLowerCase().replace(/\s+/g, '_').replace(/^program\s*/i, 'program_')
      if (['program_a', 'program_b', 'program_c'].includes(normalized)) {
        updates.assigned_program = normalized
        fieldsUpdated.push('assigned_program')
      }
    }
  }

  // Subscription status
  const statusKey = notionPropsFound.find((k) => /^status$|subscription.*status|client.*status/i.test(k))
  if (statusKey) {
    const raw = props[statusKey]?.select?.name ?? props[statusKey]?.status?.name
    const validStatuses = ['active', 'inactive', 'canceled', 'past_due', 'trialing']
    if (raw && validStatuses.includes(raw.toLowerCase())) {
      updates.subscription_status = raw.toLowerCase()
      fieldsUpdated.push('subscription_status')
    }
  }

  if (fieldsUpdated.length > 0) {
    const { error: updateErr } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    synced: fieldsUpdated.length > 0,
    fields_updated: fieldsUpdated,
    notion_properties_available: notionPropsFound,
    message: fieldsUpdated.length > 0
      ? `Pulled ${fieldsUpdated.length} field(s) from Notion`
      : 'No matching properties found. Check that your Notion page has: Stage, Program, Status, or Notes properties.',
  })
}

// ─── POST /api/admin/notion-sync ─────────────────────────────────────────────
// Push portal data → Notion, and optionally link/update notion_page_id
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin()
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!NOTION_API_KEY) return NextResponse.json({ error: 'NOTION_API_KEY not configured' }, { status: 503 })

  const body = await req.json() as { user_id: string; notion_page_id?: string }
  const { user_id, notion_page_id: newPageId } = body
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user_id).single()
  if (!profile) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Resolve which page ID to use — new one takes priority over stored one
  const rawPageId = newPageId?.trim() || profile.notion_page_id
  if (!rawPageId) return NextResponse.json({ error: 'No Notion page ID provided or linked.' }, { status: 400 })

  // Parse out the page ID from a full Notion URL if provided
  // e.g. https://www.notion.so/workspace/Title-abc123def456 → abc123def456
  const pageIdMatch = rawPageId.match(/([a-f0-9]{32})/)
  const pageIdWithDashes = rawPageId.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)
  const pageId = pageIdWithDashes ? rawPageId : (pageIdMatch ? pageIdMatch[1] : rawPageId)

  // If a new page ID was provided, persist it
  if (newPageId && newPageId !== profile.notion_page_id) {
    await supabase.from('profiles').update({ notion_page_id: pageId }).eq('id', user_id)
  }

  // Fetch the Notion page to discover property types
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders(),
  })
  if (!pageRes.ok) {
    const err = await pageRes.json()
    return NextResponse.json({ error: err.message ?? 'Failed to access Notion page. Check that the page exists and your integration has access.' }, { status: pageRes.status })
  }
  const page = await pageRes.json()
  const existingProps = page.properties ?? {}
  const propKeys = Object.keys(existingProps)

  // Build the Notion update payload
  const updateProps: Record<string, unknown> = {}
  const fieldsPushed: string[] = []

  const programLabels: Record<string, string> = {
    program_a: 'Program A',
    program_b: 'Program B',
    program_c: 'Program C',
  }

  // Program
  const programKey = propKeys.find((k) => /^program$|assigned.*program/i.test(k))
  if (programKey && profile.assigned_program) {
    const label = programLabels[profile.assigned_program] ?? profile.assigned_program
    if (existingProps[programKey]?.type === 'select') {
      updateProps[programKey] = { select: { name: label } }
      fieldsPushed.push('program')
    } else if (existingProps[programKey]?.type === 'rich_text') {
      updateProps[programKey] = { rich_text: [{ text: { content: label } }] }
      fieldsPushed.push('program')
    }
  }

  // Stage
  const stageKey = propKeys.find((k) => /^stage$|current.*stage/i.test(k))
  if (stageKey && profile.current_stage) {
    if (existingProps[stageKey]?.type === 'select') {
      updateProps[stageKey] = { select: { name: profile.current_stage } }
      fieldsPushed.push('stage')
    } else if (existingProps[stageKey]?.type === 'rich_text') {
      updateProps[stageKey] = { rich_text: [{ text: { content: profile.current_stage } }] }
      fieldsPushed.push('stage')
    }
  }

  // Admin notes
  const notesKey = propKeys.find((k) => /notes|admin.*notes|internal.*notes|crm.*notes/i.test(k))
  if (notesKey && profile.admin_notes && existingProps[notesKey]?.type === 'rich_text') {
    updateProps[notesKey] = { rich_text: [{ text: { content: profile.admin_notes.substring(0, 2000) } }] }
    fieldsPushed.push('admin_notes')
  }

  // Subscription status
  const statusKey = propKeys.find((k) => /^status$|subscription.*status|client.*status/i.test(k))
  if (statusKey && profile.subscription_status) {
    if (existingProps[statusKey]?.type === 'select') {
      updateProps[statusKey] = { select: { name: profile.subscription_status } }
      fieldsPushed.push('status')
    } else if (existingProps[statusKey]?.type === 'status') {
      updateProps[statusKey] = { status: { name: profile.subscription_status } }
      fieldsPushed.push('status')
    }
  }

  if (Object.keys(updateProps).length === 0) {
    return NextResponse.json({
      synced: false,
      message: 'No matching Notion properties found. Make sure your Notion page has properties named: Program, Stage, Status, or Notes.',
      notion_properties_available: propKeys,
    })
  }

  // Apply the update to Notion
  const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({ properties: updateProps }),
  })

  if (!updateRes.ok) {
    const err = await updateRes.json()
    return NextResponse.json({ error: err.message ?? 'Failed to update Notion page' }, { status: updateRes.status })
  }

  return NextResponse.json({
    synced: true,
    fields_pushed: fieldsPushed,
    notion_page_id: pageId,
    message: `Pushed ${fieldsPushed.length} field(s) to Notion`,
  })
}
