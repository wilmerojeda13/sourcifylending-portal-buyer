import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ComplianceAuditClient from './ComplianceAuditClient'
import { isMissingRelationError } from '@/lib/supabase-schema'

export const dynamic = 'force-dynamic'

export default async function AdminCompliancePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [consentRes, securityRes, failuresRes] = await Promise.all([
    supabase.from('public_form_consent_records').select('*').order('submitted_at', { ascending: false }).limit(100),
    supabase.from('public_form_security_events').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('signup_automation_failures').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const schemaMissing =
    isMissingRelationError(consentRes.error, 'public_form_consent_records') ||
    isMissingRelationError(securityRes.error, 'public_form_security_events') ||
    isMissingRelationError(failuresRes.error, 'signup_automation_failures')

  if (!schemaMissing) {
    if (consentRes.error) throw consentRes.error
    if (securityRes.error) throw securityRes.error
    if (failuresRes.error) throw failuresRes.error
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Compliance Audit</h1>
            <p className="mt-1 text-sm text-gray-500">
              Consent evidence, form abuse controls, and signup automation failure review.
            </p>
          </div>
          <Link href="/admin" className="inline-flex w-fit text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700">
            ← Admin Hub
          </Link>
        </div>

        <ComplianceAuditClient
          consentRecords={schemaMissing ? [] : (consentRes.data ?? [])}
          securityEvents={schemaMissing ? [] : (securityRes.data ?? [])}
          automationFailures={schemaMissing ? [] : (failuresRes.data ?? [])}
          schemaMissing={schemaMissing}
        />
      </div>
    </div>
  )
}
