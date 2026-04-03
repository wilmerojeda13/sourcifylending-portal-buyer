'use client'

import { useMemo, useState } from 'react'

type ConsentRecord = {
  id: string
  form_name: string
  page_url: string
  submitted_at: string
  consent_text_version: string
  disclosure_text: string | null
  consent_given: boolean
  email: string | null
  full_name: string | null
  business_name: string | null
  phone: string | null
  ip_address: string | null
  user_agent: string | null
  related_lead_id: string | null
  related_user_id: string | null
  related_profile_id: string | null
  metadata: Record<string, unknown> | null
}

type SecurityEvent = {
  id: string
  form_name: string
  email: string | null
  full_name: string | null
  business_name: string | null
  ip_address: string | null
  user_agent: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type AutomationFailure = {
  id: string
  user_id: string | null
  email: string | null
  stage: string
  source: string
  error_message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export default function ComplianceAuditClient({
  consentRecords,
  securityEvents,
  automationFailures,
  schemaMissing,
}: {
  consentRecords: ConsentRecord[]
  securityEvents: SecurityEvent[]
  automationFailures: AutomationFailure[]
  schemaMissing: boolean
}) {
  const [formFilter, setFormFilter] = useState('all')

  const filteredConsent = useMemo(() => (
    formFilter === 'all'
      ? consentRecords
      : consentRecords.filter((row) => row.form_name === formFilter)
  ), [consentRecords, formFilter])

  const forms = Array.from(new Set(consentRecords.map((row) => row.form_name)))

  if (schemaMissing) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Compliance audit tables are not in Supabase yet. Run the migration first.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Consent Records', consentRecords.length],
          ['Security Events', securityEvents.length],
          ['Blocked Attempts', securityEvents.filter((row) => row.event_type.startsWith('blocked_')).length],
          ['Automation Failures', automationFailures.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Consent Records</h2>
            <p className="text-xs text-gray-500">Structured audit trail for public form consent capture.</p>
          </div>
          <select
            value={formFilter}
            onChange={(event) => setFormFilter(event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
          >
            <option value="all">All forms</option>
            {forms.map((form) => (
              <option key={form} value={form}>{form}</option>
            ))}
          </select>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredConsent.slice(0, 50).map((record) => (
            <div key={record.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium text-gray-900">{record.full_name || record.email || 'Unknown submitter'}</div>
                  <div className="text-xs text-gray-500">{record.form_name} · {record.page_url}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {record.email || 'No email'} {record.phone ? `· ${record.phone}` : ''} {record.business_name ? `· ${record.business_name}` : ''}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  <div>{new Date(record.submitted_at).toLocaleString()}</div>
                  <div>{record.consent_text_version}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded-full px-2 py-1 font-semibold ${record.consent_given ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {record.consent_given ? 'Consent captured' : 'Consent missing'}
                </span>
                {record.ip_address && <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{record.ip_address}</span>}
                {record.related_lead_id && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Lead linked</span>}
                {record.related_user_id && <span className="rounded-full bg-purple-50 px-2 py-1 text-purple-700">User linked</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Blocked / Accepted Form Events</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {securityEvents.slice(0, 30).map((event) => (
              <div key={event.id} className="px-5 py-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{event.form_name}</div>
                    <div className="text-xs text-gray-500">{event.email || event.full_name || 'Unknown submitter'}</div>
                  </div>
                  <div className={`rounded-full px-2 py-1 text-[11px] font-semibold ${event.event_type.startsWith('blocked_') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {event.event_type}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Signup Automation Failures</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {automationFailures.length === 0 && (
              <div className="px-5 py-8 text-sm text-gray-500">No signup automation failures recorded.</div>
            )}
            {automationFailures.map((failure) => (
              <div key={failure.id} className="px-5 py-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{failure.email || 'Unknown email'}</div>
                    <div className="text-xs text-gray-500">{failure.source} · {failure.stage}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(failure.created_at).toLocaleString()}</div>
                </div>
                <p className="mt-2 text-xs text-red-700">{failure.error_message}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
