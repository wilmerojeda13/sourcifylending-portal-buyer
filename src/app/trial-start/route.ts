import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { localizeHref, normalizeLocale } from '@/lib/i18n'
import type { BillingStatus, ProgramId } from '@/types'

const VALID_PROGRAMS = new Set<ProgramId>(['program_a', 'program_b', 'program_c'])
const ACTIVE_MEMBER_STATUSES = new Set<BillingStatus>(['active', 'trialing', 'past_due', 'past_due_locked', 'suspended'])

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const program = url.searchParams.get('program') as ProgramId | null
  const locale = normalizeLocale(url.searchParams.get('sl_locale'))

  if (!program || !VALID_PROGRAMS.has(program)) {
    return NextResponse.redirect(new URL(localizeHref('/pricing', locale), request.url))
  }

  const nextPath = `/trial-start?program=${encodeURIComponent(program)}${locale ? `&sl_locale=${encodeURIComponent(locale)}` : ''}`
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user) {
    const signInUrl = new URL(localizeHref('/sign-in', locale), request.url)
    signInUrl.searchParams.set('next', nextPath)
    signInUrl.searchParams.set('sl_locale', locale)
    return NextResponse.redirect(signInUrl)
  }

  const profileClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await createServiceClient()
    : authClient

  const { data: profile } = await profileClient
    .from('profiles')
    .select('assigned_program, billing_status, is_demo')
    .eq('id', user.id)
    .maybeSingle()

  if (
    profile &&
    !!profile.assigned_program &&
    (
      ACTIVE_MEMBER_STATUSES.has((profile.billing_status ?? 'inactive') as BillingStatus) ||
      profile.is_demo
    )
  ) {
    return NextResponse.redirect(new URL(localizeHref('/billing', locale), request.url))
  }

  await profileClient
    .from('profiles')
    .update({
      assigned_program: program,
      acquisition_path: 'self_serve',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  return NextResponse.redirect(new URL(localizeHref('/enroll', locale), request.url))
}
