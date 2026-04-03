'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, CheckCircle, MessageSquare } from 'lucide-react'
import PublicMessagingConsent from '@/components/compliance/PublicMessagingConsent'
import TurnstileWidget from '@/components/compliance/TurnstileWidget'
import {
  CompliancePayload,
  CONSENT_TEXT_VERSION,
  REQUIRED_MESSAGING_DISCLOSURE,
} from '@/lib/public-form-compliance'

export default function GetStartedPage() {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [form, setForm] = useState({
    full_name: '',
    business_name: '',
    email: '',
    phone: '',
    message: '',
    website: '',
    consent: false,
  })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const compliance: CompliancePayload = {
      enabled: true,
      form_name: 'public_get_started',
      page_url: typeof window !== 'undefined' ? window.location.href : '/get-started',
      timestamp: new Date().toISOString(),
      consent_text_version: CONSENT_TEXT_VERSION,
      disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
      consent_given: form.consent,
    }

    const response = await fetch('/api/public/lead-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, turnstileToken, compliance }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? 'Unable to submit form right now.')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">SL</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">SourcifyLending</p>
              <p className="text-xs text-gray-500">Public Intake Form</p>
            </div>
          </Link>
          <div className="text-sm text-gray-500">
                <Link href="/privacy" className="brand-link">Privacy</Link>
            <span className="mx-2 text-gray-300">•</span>
                <Link href="/terms" className="brand-link">Terms</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="card p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 mb-4">
              <MessageSquare size={15} />
              Public web form with SMS consent
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
              Get started with SourcifyLending
            </h1>
            <p className="mt-4 text-gray-600 leading-relaxed">
              Submit this form to request portal access and a follow-up from SourcifyLending. This is the live public page used for consent-based outreach.
            </p>

            {done ? (
              <div className="mt-8 rounded-3xl border border-green-200 bg-green-50 p-6">
                <div className="flex items-center gap-3 text-green-700">
                  <CheckCircle size={22} />
                  <h2 className="text-lg font-semibold">Submission received</h2>
                </div>
                <p className="mt-3 text-sm text-green-800">
                  Your information and SMS consent were recorded. A SourcifyLending team member can now follow up using the details you submitted.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="label">Full Name</label>
                  <input className="input-field" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Business Name</label>
                  <input className="input-field" value={form.business_name} onChange={(e) => updateField('business_name', e.target.value)} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Email</label>
                    <input className="input-field" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input-field" type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
                  </div>
                </div>
                <div className="hidden" aria-hidden="true">
                  <label className="label">Website</label>
                  <input className="input-field" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => updateField('website', e.target.value)} />
                </div>
                <div>
                  <label className="label">How can we help?</label>
                  <textarea
                    className="input-field min-h-[120px] resize-y"
                    value={form.message}
                    onChange={(e) => updateField('message', e.target.value)}
                    placeholder="Tell us what you need help with."
                  />
                </div>

                <PublicMessagingConsent
                  checked={form.consent}
                  onChange={(checked) => updateField('consent', checked)}
                />

                <TurnstileWidget token={turnstileToken} onTokenChange={setTurnstileToken} />

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full py-3.5" disabled={loading || !form.consent || !turnstileEnabled || !turnstileToken}>
                  {loading ? 'Submitting…' : 'Submit and Continue'} <ArrowRight size={16} />
                </button>
              </form>
            )}
          </section>

          <aside className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-gray-900">Why this page matters</h2>
            <ul className="mt-5 space-y-3 text-sm text-gray-600">
              <li>This is a public live web form on the production marketing domain.</li>
              <li>The form contains explicit SMS consent language.</li>
              <li>The page links directly to the Privacy Policy and Terms of Service.</li>
              <li>Each submission stores the consent proof with the CRM lead record and creates an admin alert.</li>
            </ul>

            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Verification URL</p>
              <p className="mt-2 break-all text-sm font-medium text-green-900">
                https://www.sourcifylending.com/get-started
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
