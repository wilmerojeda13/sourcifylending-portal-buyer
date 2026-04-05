'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, CheckCircle, DollarSign, Users, TrendingUp,
  Shield, Star, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'
import PublicLegalLinks from '@/components/compliance/PublicLegalLinks'
import PublicMessagingConsent from '@/components/compliance/PublicMessagingConsent'
import TurnstileWidget from '@/components/compliance/TurnstileWidget'
import {
  CompliancePayload,
  CONSENT_TEXT_VERSION,
  REQUIRED_MESSAGING_DISCLOSURE,
} from '@/lib/public-form-compliance'

const MARKETING_CHANNEL_OPTIONS = [
  'Social Media',
  'Email Newsletter',
  'Paid Ads',
  'Business Network',
  'YouTube / Podcast',
  'Website / Blog',
  'Other',
]

export default function PartnersPage() {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company_name: '',
    website_or_social: '',
    promotion_plan: '',
    referral_experience: '',
    monthly_referral_estimate: '',
    marketing_channels: [] as string[],
    agreed_to_terms: false,
    consent: false,
  })

  const toggleChannel = (ch: string) => {
    setForm(f => ({
      ...f,
      marketing_channels: f.marketing_channels.includes(ch)
        ? f.marketing_channels.filter(c => c !== ch)
        : [...f.marketing_channels, ch],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          turnstileToken,
          referral_experience: form.referral_experience === 'yes',
          compliance: {
            enabled: true,
            form_name: 'public_partner_application',
            page_url: typeof window !== 'undefined' ? window.location.href : '/partners',
            timestamp: new Date().toISOString(),
            consent_text_version: CONSENT_TEXT_VERSION,
            disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
            consent_given: form.consent,
          } satisfies CompliancePayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setSuccess(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600 sm:h-9 sm:w-9">
            <span className="text-xs font-bold text-white sm:text-sm">SL</span>
          </div>
          <span className="truncate whitespace-nowrap text-sm font-bold text-gray-900 sm:text-base">SourcifyLending</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link href="/affiliate/login" className="brand-link whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm">
            Partner Login
          </Link>
          <Link href="/pricing" className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline">
            Sign In
          </Link>
          <Link href="/analyzer" className="btn-primary whitespace-nowrap px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm">
            Free Analyzer
          </Link>
        </div>
      </header>

      {/* Success state */}
      {success ? (
        <section className="max-w-2xl mx-auto px-6 py-24 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Application Submitted!</h1>
          <p className="text-gray-500 text-lg mb-8 leading-relaxed">
            Thank you for your interest in the SourcifyLending Partner Program. Our team will review your
            application and follow up within <strong className="text-gray-700">2 business days</strong>.
          </p>
          <div className="bg-green-50 border border-green-100 rounded-2xl p-6 text-left mb-8">
            <h3 className="font-bold text-green-900 mb-3 text-sm">What happens next</h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2"><CheckCircle size={14} className="mt-0.5 shrink-0" /> Our team reviews your application</li>
              <li className="flex items-start gap-2"><CheckCircle size={14} className="mt-0.5 shrink-0" /> If approved, you'll receive login credentials for your partner portal</li>
              <li className="flex items-start gap-2"><CheckCircle size={14} className="mt-0.5 shrink-0" /> We&apos;ll confirm how you add, onboard, and support partner-assisted clients</li>
            </ul>
          </div>
          <Link href="/" className="btn-secondary text-sm px-6 py-3 inline-flex items-center gap-2">
            Back to Home
          </Link>
        </section>
      ) : (
        <>
          {/* Hero */}
          <section className="max-w-4xl mx-auto px-6 pt-16 pb-14 text-center">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Star size={14} />
              SourcifyLending Partner Program
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
              Close and onboard clients.<br />
              <span className="text-green-600">Run your client book on SourcifyLending.</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
              This is a true partner-assisted model, not a passive referral program. Partners bring in the client,
              close the client, onboard the client, and remain the frontline relationship owner while SourcifyLending
              provides the platform, billing rails, and fulfillment infrastructure.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setShowForm(true); setTimeout(() => document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' }), 50) }}
                className="btn-primary text-base px-8 py-4"
              >
                Apply Now <ArrowRight size={18} />
              </button>
              <a href="#how-it-works" className="btn-secondary text-base px-8 py-4">
                Learn More
              </a>
            </div>
          </section>

          {/* Stats strip */}
          <section className="bg-green-600 py-10 px-6">
            <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              {[
                { value: '80%', label: 'Setup fee payout on Program A/B' },
                { value: '20%', label: 'Recurring monthly commission' },
                { value: '5 clients', label: 'Unlocks free Program B access' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-3xl font-bold text-white mb-1">{s.value}</p>
                  <p className="text-green-200 text-sm">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="bg-gray-50 py-16 px-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">How It Works</h2>
              <p className="text-gray-500 text-center mb-12">Three simple steps. Partners own the relationship.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    step: '01',
                    icon: Users,
                    title: 'Bring In The Client',
                    desc: 'Add the client through your partner workflow or invite them from your partner portal. The client is marked as Partner-Assisted from the start.',
                    color: 'bg-green-100 text-green-600',
                  },
                  {
                    step: '02',
                    icon: TrendingUp,
                    title: 'You Close & Onboard',
                    desc: 'You are expected to close the client, guide them into the right program, help with onboarding, and remain the frontline point of contact.',
                    color: 'bg-green-100 text-green-600',
                  },
                  {
                    step: '03',
                    icon: DollarSign,
                    title: 'Earn Partner Compensation',
                    desc: 'Earn 80% of collected setup fees on partner-assisted Program A and B deals, plus 20% of successful monthly subscription revenue.',
                    color: 'bg-green-100 text-green-600',
                  },
                ].map(({ step, icon: Icon, title, desc, color }) => (
                  <div key={step} className="card relative">
                    <span className="absolute top-5 right-5 text-3xl font-black text-gray-100">{step}</span>
                    <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-4`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Commission breakdown */}
          <section className="py-16 px-6 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">Commission Structure</h2>
            <p className="text-gray-500 text-center mb-10">Paid only on successful collected revenue. No payout on failed charges, disputes, or refunds.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  badge: 'Program A',
                  desc: null,
                  setup: '$400',
                  monthly: '$89.80/mo',
                  setupNote: '80% of $500 setup fee',
                  monthlyNote: '20% of $449/month',
                  year1: '$1,478',
                  color: 'border-green-200 bg-green-50/40',
                  badgeColor: 'bg-green-100 text-green-700',
                },
                {
                  badge: 'Program B',
                  desc: null,
                  setup: '$240',
                  monthly: '$49.80/mo',
                  setupNote: '80% of $300 setup fee',
                  monthlyNote: '20% of $249/month',
                  year1: '$838',
                  color: 'border-emerald-200 bg-emerald-50/40',
                  badgeColor: 'bg-emerald-100 text-emerald-700',
                },
                {
                  badge: 'Program C',
                  desc: null,
                  setup: '—',
                  monthly: '$19.40/mo',
                  setupNote: 'No setup fee',
                  monthlyNote: '20% of $97/month',
                  year1: '$233',
                  color: 'border-blue-200 bg-blue-50/40',
                  badgeColor: 'bg-blue-100 text-blue-700',
                },
                {
                  badge: 'Program A + B',
                  desc: 'Combined business credit building and personal credit optimization with 0% APR strategy.',
                  setup: '$640',
                  monthly: '$119.60/mo',
                  setupNote: '80% of $800 setup fee',
                  monthlyNote: '20% of $598/month',
                  year1: '$2,075',
                  color: 'border-green-400 bg-green-100/40',
                  badgeColor: 'bg-green-200 text-green-800',
                },
              ].map(({ badge, desc, setup, monthly, setupNote, monthlyNote, year1, color, badgeColor }) => (
                <div key={badge} className={`card border-2 ${color}`}>
                  <span className={`badge ${badgeColor} mb-3`}>{badge}</span>
                  {desc && <p className="text-xs text-gray-500 mb-3 leading-relaxed">{desc}</p>}
                  <div className="space-y-3 mb-4">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{setup}</p>
                      <p className="text-xs text-gray-400">Setup commission · {setupNote}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{monthly}</p>
                      <p className="text-xs text-gray-400">Recurring commission · {monthlyNote}</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500">Year 1 estimate</p>
                    <p className="text-lg font-bold text-green-600">{year1}+</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-6">
              Estimates assume one active partner-assisted client per program for 12 months. Actual earnings vary and are never guaranteed.
            </p>
          </section>

          {/* Free access incentive */}
          <section className="bg-gray-50 py-16 px-6">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Star size={14} />
                Performance Incentive
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Unlock Free Program B Access</h2>
              <p className="text-gray-500 mb-10 text-base leading-relaxed">
                Maintain 5 active paying partner-assisted clients for 14 consecutive days and earn complimentary access
                to Program B — the Business Credit Builder — at no cost. Access is automatically unlocked and
                automatically revoked if you fall below the threshold.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                {[
                  { number: '5', label: 'Active paying partner clients required', icon: Users },
                  { number: '14', label: 'Consecutive days to qualify', icon: TrendingUp },
                  { number: 'Free', label: 'Program B access unlocked', icon: Star },
                ].map(({ number, label, icon: Icon }) => (
                  <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <p className="text-3xl font-bold text-green-600 mb-1">{number}</p>
                    <p className="text-sm text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-6">
                Complimentary access applies to Program B only. Non-transferable. No cash value.
                Access locks immediately if you fall below 5 active paying clients.
              </p>
            </div>
          </section>

          {/* Who it's for */}
          <section className="py-16 px-6 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Who This Is For</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: 'Business Coaches', desc: 'You work with small business owners who need credit solutions.' },
                { title: 'Financial Educators', desc: 'You can guide business owners through closing, onboarding, and using the platform.' },
                { title: 'Consultants & Agencies', desc: 'You want infrastructure behind the scenes while you stay client-facing.' },
                { title: 'Networkers & Brokers', desc: 'You have relationships with business owners who need capital and ongoing implementation support.' },
              ].map(({ title, desc }) => (
                <div key={title} className="card">
                  <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center mb-3">
                    <CheckCircle size={16} className="text-green-600" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Application form */}
          <section id="apply-form" className="bg-gray-50 py-16 px-6">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Apply to Become a Partner</h2>
                <p className="text-gray-500">
                  All applications are reviewed manually. We&apos;ll confirm fit for a partner-assisted sales relationship within 2 business days.
                </p>
              </div>

              {/* Toggle form visibility on mobile */}
              {!showForm && (
                <div className="text-center">
                  <button
                    onClick={() => setShowForm(true)}
                    className="btn-primary text-base px-10 py-4"
                  >
                    Open Application <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {showForm && (
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-5">

                  {/* Name + Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Jane Smith"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="jane@example.com"
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* Phone + Company */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="(555) 000-0000"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Company / Brand Name</label>
                      <input
                        type="text"
                        value={form.company_name}
                        onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                        placeholder="Acme LLC (optional)"
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website or Social Profile</label>
                    <input
                      type="url"
                      value={form.website_or_social}
                      onChange={e => setForm(f => ({ ...f, website_or_social: e.target.value }))}
                      placeholder="https://yoursite.com or @yourhandle"
                      className="input-field"
                    />
                  </div>

                  {/* Marketing channels */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">How do you plan to promote? (select all that apply)</label>
                    <div className="flex flex-wrap gap-2">
                      {MARKETING_CHANNEL_OPTIONS.map(ch => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => toggleChannel(ch)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            form.marketing_channels.includes(ch)
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                          }`}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Monthly estimate */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated monthly referral volume</label>
                    <select
                      value={form.monthly_referral_estimate}
                      onChange={e => setForm(f => ({ ...f, monthly_referral_estimate: e.target.value }))}
                      className="input-field"
                    >
                      <option value="">Select an estimate</option>
                      <option value="1-3">1–3 per month</option>
                      <option value="4-10">4–10 per month</option>
                      <option value="11-25">11–25 per month</option>
                      <option value="25+">25+ per month</option>
                    </select>
                  </div>

                  {/* Prior experience */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Have you closed and onboarded business funding or credit clients before? <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-4">
                      {['yes', 'no'].map(v => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="referral_experience"
                            value={v}
                            checked={form.referral_experience === v}
                            onChange={() => setForm(f => ({ ...f, referral_experience: v }))}
                            className="accent-green-600"
                            required
                          />
                          <span className="text-sm text-gray-700 capitalize">{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Promotion plan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      How do you plan to promote SourcifyLending? <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={form.promotion_plan}
                      onChange={e => setForm(f => ({ ...f, promotion_plan: e.target.value }))}
                      placeholder="Describe how you would bring in clients, close them, onboard them, and remain their frontline point of contact."
                      className="input-field resize-none"
                    />
                  </div>

                  {/* Terms */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={form.agreed_to_terms}
                        onChange={e => setForm(f => ({ ...f, agreed_to_terms: e.target.checked }))}
                        className="mt-0.5 accent-green-600"
                      />
                      <span className="text-sm text-gray-600 leading-relaxed">
                        I agree to the SourcifyLending Partner Program terms. I understand that partners may not
                        promise approvals, guarantee funding amounts, or misrepresent SourcifyLending's services.
                        I will use only approved marketing language. I understand that partner compensation is earned
                        only on partner-assisted clients I close and onboard, and only on successfully collected revenue.
                        SourcifyLending may suspend or terminate partner access at any time for violations.
                        <span className="text-red-500 ml-1">*</span>
                      </span>
                    </label>
                  </div>

                  <PublicMessagingConsent
                    checked={form.consent}
                    onChange={(checked) => setForm(f => ({ ...f, consent: checked }))}
                  />

                  <TurnstileWidget token={turnstileToken} onTokenChange={setTurnstileToken} />

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !form.consent || !turnstileEnabled || !turnstileToken}
                    className="btn-primary w-full text-base py-4 disabled:opacity-60"
                  >
                    {loading ? (
                      <><Loader2 size={18} className="animate-spin" /> Submitting…</>
                    ) : (
                      <>Submit Application <ArrowRight size={18} /></>
                    )}
                  </button>

                  <p className="text-center text-xs text-gray-400">
                    We review all applications manually and respond within 2 business days.
                  </p>
                </form>
              )}
            </div>
          </section>

          {/* Compliance + CTA footer strip */}
          <section className="bg-green-600 py-14 px-6 text-center">
            <div className="max-w-2xl mx-auto">
              <Shield size={36} className="text-green-200 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-3">Ready to Get Started?</h2>
              <p className="text-green-200 mb-8">
                Join partners who want to manage their own client book using SourcifyLending as the platform behind the scenes.
              </p>
              <button
                onClick={() => { setShowForm(true); document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="inline-flex items-center gap-2 bg-white text-green-600 font-bold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors text-base"
              >
                Apply Now <ArrowRight size={18} />
              </button>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-gray-100 py-8 px-6">
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-400">
                © {new Date().getFullYear()} SourcifyLending. Partner earnings are not guaranteed. Compensation is
                earned on successfully collected payments only.
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <Link href="/" className="brand-link-muted">Home</Link>
                <Link href="/analyzer" className="brand-link-muted">Free Analyzer</Link>
                <Link href="/affiliate/login" className="brand-link-muted">Partner Login</Link>
                <Link href="/login" className="brand-link-muted">Client Login</Link>
                <Link href="/privacy" className="brand-link-muted">Privacy</Link>
                <Link href="/terms" className="brand-link-muted">Terms</Link>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
