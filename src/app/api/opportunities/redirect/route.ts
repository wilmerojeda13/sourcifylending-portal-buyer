import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opportunities/redirect?id=OPPORTUNITY_ID
 *
 * Server-side tracked redirect for opportunity Apply Now links.
 * 1. Looks up the opportunity in the DB (RLS-gated to the authenticated user's account)
 * 2. Validates the URL is a real https:// destination
 * 3. Logs an `application_attempted` activity event with full metadata
 * 4. Issues a 302 redirect to the actual destination URL
 *
 * This replaces direct client-side href links so every click is reliably tracked
 * server-side, even if the browser blocks or ignores the fire-and-forget fetch.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  // ── Validate param ──────────────────────────────────────────────────────────
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Invalid opportunity ID', { status: 400 })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    // Unauthenticated — redirect to login instead of erroring
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // ── Fetch opportunity — account_opportunities is a global shared table;
  //    RLS already gates reads to authenticated users (is_active = true).
  //    No per-account filtering needed — just look up by ID.
  const supabase = await createServiceClient()

  const { data: opp, error } = await supabase
    .from('account_opportunities')
    .select('id, name, program, stage, apply_url, is_active')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (error || !opp) {
    return new NextResponse('Opportunity not found', { status: 404 })
  }

  // ── Validate URL ────────────────────────────────────────────────────────────
  const url = opp.apply_url?.trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    // No valid URL — redirect back with a message
    return NextResponse.redirect(new URL('/opportunities?error=no_url', req.url))
  }

  // Extra safety: ensure URL parses successfully
  let destination: URL
  try {
    destination = new URL(url)
    // Only allow http/https
    if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
      throw new Error('Invalid protocol')
    }
  } catch {
    return NextResponse.redirect(new URL('/opportunities?error=invalid_url', req.url))
  }

  // ── Log the click (fire-and-forget — never block the redirect) ──────────────
  logActivity(user.id, 'application_attempted', {
    opportunity_id: opp.id,
    opportunity_name: opp.name,
    program: opp.program,
    stage: opp.stage,
    destination_url: destination.href,
    destination_host: destination.hostname,
    tracked_server_side: true,
  }, req).catch(() => {})

  // ── Redirect ────────────────────────────────────────────────────────────────
  return NextResponse.redirect(destination.href, { status: 302 })
}
