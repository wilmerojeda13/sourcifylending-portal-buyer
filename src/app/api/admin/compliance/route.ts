import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMissingRelationError } from '@/lib/supabase-schema'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return null

  return supabase
}

export async function GET() {
  try {
    const supabase = await requireAdmin()
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [consentRes, securityRes, failuresRes] = await Promise.all([
      supabase
        .from('public_form_consent_records')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(100),
      supabase
        .from('public_form_security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('signup_automation_failures')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const schemaMissing =
      isMissingRelationError(consentRes.error, 'public_form_consent_records') ||
      isMissingRelationError(securityRes.error, 'public_form_security_events') ||
      isMissingRelationError(failuresRes.error, 'signup_automation_failures')

    if (schemaMissing) {
      return NextResponse.json({
        schemaMissing: true,
        consentRecords: [],
        securityEvents: [],
        automationFailures: [],
      })
    }

    if (consentRes.error) throw consentRes.error
    if (securityRes.error) throw securityRes.error
    if (failuresRes.error) throw failuresRes.error

    return NextResponse.json({
      schemaMissing: false,
      consentRecords: consentRes.data ?? [],
      securityEvents: securityRes.data ?? [],
      automationFailures: failuresRes.data ?? [],
    })
  } catch (error) {
    console.error('[admin/compliance] GET failed', error)
    return NextResponse.json({ error: 'Unable to load compliance audit.' }, { status: 500 })
  }
}
