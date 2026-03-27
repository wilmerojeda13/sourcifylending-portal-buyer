import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NOTION_API_KEY = process.env.NOTION_API_KEY
const NOTION_DB_ID   = process.env.NOTION_CONTACTS_DB_ID ?? '2fc7e40fd2244cdfb3ff27944719f695'
const NOTION_VERSION = '2022-06-28'

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

// ─── Disposition → CRM stage ──────────────────────────────────────────────────
function mapStage(disposition: string | null): string {
  switch (disposition) {
    case 'New Lead':           return 'new'
    case 'Follow Up':
    case 'Attempted Contact':
    case 'Unresponsive':
    case 'Demo No-Show':       return 'contacted'
    case 'Demo Booked':        return 'demo_scheduled'
    case 'Demo Held':          return 'qualified'
    case 'Contract Out':
    case 'Active Client':
    case 'Closed Won':         return 'closed_won'
    case 'Bad Lead':
    case 'Not Interested':
    case 'Closed Lost':
    case 'Do Not Call':        return 'closed_lost'
    default:                   return 'new'
  }
}

// ─── Program → CRM program_interest ──────────────────────────────────────────
function mapProgram(program: string | null): string | null {
  if (!program) return null
  if (/program.?a|0%|intro/i.test(program))    return 'program_a'
  if (/program.?b|builder/i.test(program))      return 'program_b'
  if (/program.?c|capital|monitoring/i.test(program)) return 'program_c'
  return null
}

// ─── Source → CRM source ─────────────────────────────────────────────────────
function mapSource(source: string | null): string {
  if (!source) return 'notion'
  const s = source.toLowerCase()
  if (s.includes('cold')) return 'cold_call'
  if (s.includes('referral')) return 'referral'
  if (s.includes('website')) return 'website'
  if (s.includes('social')) return 'social_media'
  if (s.includes('email')) return 'email_campaign'
  return 'notion'
}

// ─── Normalize phone ─────────────────────────────────────────────────────────
function normalizePhone(raw: string | number | null): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 7) return `+1${digits.slice(-10)}`
  return null
}

// ─── Extract plain text from Notion property ─────────────────────────────────
function getText(prop: Record<string, unknown> | undefined): string {
  if (!prop) return ''
  if (prop.type === 'title' || prop.type === 'rich_text') {
    return ((prop[prop.type as string] as { plain_text?: string }[]) ?? [])
      .map((r) => r.plain_text ?? '').join('')
  }
  if (prop.type === 'phone_number') return String(prop.phone_number ?? '')
  if (prop.type === 'email') return String(prop.email ?? '')
  if (prop.type === 'number') return prop.number != null ? String(prop.number) : ''
  if (prop.type === 'select') return (prop.select as { name?: string })?.name ?? ''
  if (prop.type === 'url') return String(prop.url ?? '')
  return ''
}

function getDate(prop: Record<string, unknown> | undefined): string | null {
  if (!prop || prop.type !== 'date') return null
  return ((prop.date as { start?: string }) ?? {}).start ?? null
}

// ─── Get non-relation property IDs to avoid "multiple data sources" error ────
async function getNonRelationPropertyIds(): Promise<string[]> {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}`, {
    headers: notionHeaders(),
  })
  if (!res.ok) return []
  const db = await res.json()
  const props = db.properties ?? {}
  // Only include simple property types — exclude relation, rollup, formula (which cause cross-db issues)
  const excluded = new Set(['relation', 'rollup', 'formula'])
  return Object.values(props)
    .filter((p: unknown) => !excluded.has((p as { type: string }).type))
    .map((p: unknown) => (p as { id: string }).id)
}

// ─── Fetch all pages from Notion DB (handles pagination) ─────────────────────
async function fetchAllNotionPages(): Promise<Record<string, unknown>[]> {
  // Get safe property IDs first (no relations/rollups/formulas)
  const filterProps = await getNonRelationPropertyIds()

  const pages: Record<string, unknown>[] = []
  let cursor: string | undefined

  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    if (filterProps.length) body.filter_properties = filterProps

    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message ?? `Notion API error ${res.status}`)
    }

    const data = await res.json()
    pages.push(...(data.results ?? []))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)

  return pages
}

// ─── POST /api/admin/crm/sync/notion ─────────────────────────────────────────
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!NOTION_API_KEY) return NextResponse.json({ error: 'NOTION_API_KEY not configured' }, { status: 503 })

  try {
    // 1. Fetch all pages from Notion
    const pages = await fetchAllNotionPages()

    // 2. Load existing phones to deduplicate
    const { data: existing } = await supabase
      .from('crm_leads')
      .select('phone')
    const existingPhones = new Set((existing ?? []).map((r: { phone: string }) => r.phone))

    // 3. Transform records
    const toInsert: Record<string, unknown>[] = []
    const toUpdate: Record<string, unknown>[] = []
    let invalid = 0

    for (const page of pages) {
      const props = (page as { properties?: Record<string, Record<string, unknown>> }).properties ?? {}

      // Name
      const fullName = getText(props['Contact Name']).trim()
      if (!fullName) { invalid++; continue }
      const [firstName, ...rest] = fullName.split(' ')
      const lastName = rest.join(' ')

      // Phone — try Phone first, then Mobile
      const rawPhone = getText(props['Phone']) || getText(props['Mobile'])
      const phone = normalizePhone(rawPhone)
      if (!phone) { invalid++; continue }

      // Other fields
      const email         = getText(props['Email']) || null
      const business      = getText(props['Business']) || null
      const disposition   = getText(props['Disposition']) || null
      const stage         = mapStage(disposition)
      const dnc           = disposition === 'Do Not Call' || getText(props['Status']) === 'DNC'
      const notes         = [
        getText(props['Notes']),
        getText(props['Call Notes']),
        getText(props['Demo Notes']),
        getText(props['Call Outcome']),
      ].filter(Boolean).join('\n\n') || null
      const follow_up_at     = getDate(props['Next Follow Up'])
      const last_contacted   = getDate(props['Last Contacted'])
      const demo_date        = getDate(props['Demo Date'])
      const program_interest = mapProgram(getText(props['Program Enrolled']))
      const source           = mapSource(getText(props['Source']))

      const record = {
        first_name:        firstName,
        last_name:         lastName,
        phone,
        email,
        business_name:     business,
        stage,
        do_not_call:       dnc,
        notes,
        follow_up_at:      follow_up_at ?? null,
        last_contacted_at: last_contacted ?? demo_date ?? null,
        program_interest,
        source,
        updated_at:        new Date().toISOString(),
      }

      if (existingPhones.has(phone)) {
        toUpdate.push(record)
      } else {
        toInsert.push({ ...record, created_at: new Date().toISOString() })
        existingPhones.add(phone)
      }
    }

    // 4. Insert new records in batches of 200
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200)
      const { error } = await supabase.from('crm_leads').insert(batch)
      if (!error) inserted += batch.length
    }

    // 5. Update existing records in batches of 200
    let updated = 0
    for (const record of toUpdate) {
      const { error } = await supabase
        .from('crm_leads')
        .update(record)
        .eq('phone', record.phone as string)
      if (!error) updated++
    }

    return NextResponse.json({
      success: true,
      total:    pages.length,
      inserted,
      updated,
      invalid,
      message: `Synced ${inserted + updated} leads from Notion (${inserted} new, ${updated} updated, ${invalid} skipped)`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
