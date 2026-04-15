'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import PublicLegalLinks from '@/components/compliance/PublicLegalLinks'
import PublicMessagingConsent from '@/components/compliance/PublicMessagingConsent'
import TurnstileWidget from '@/components/compliance/TurnstileWidget'
import { CRM_INVITE_COOKIE } from '@/lib/crm-invites'
import { CRM_TEXT_COOKIE } from '@/lib/crm-sms'
import {
  CompliancePayload,
  CONSENT_TEXT_VERSION,
  REQUIRED_MESSAGING_DISCLOSURE,
} from '@/lib/public-form-compliance'

export default function SignupPage() {
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const searchParams = useSearchParams()
  const crmInviteId = searchParams.get('crm_invite')
  const crmTextId = searchParams.get('crm_text')

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    business_name: '',
    website: '',
    consent: false,
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    if (!crmInviteId) return
    document.cookie = `${CRM_INVITE_COOKIE}=${encodeURIComponent(crmInviteId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
    fetch(`/api/crm/invites/${crmInviteId}/engagement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'clicked', metadata: { page: 'signup' } }),
    }).catch(() => {})
  }, [crmInviteId])

  useEffect(() => {
    if (!crmTextId) return
    document.cookie = `${CRM_TEXT_COOKIE}=${encodeURIComponent(crmTextId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
  }, [crmTextId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        crm_invite_id: crmInviteId,
        crm_text_id: crmTextId,
        turnstileToken,
        compliance: {
          enabled: true,
          form_name: 'public_signup',
          page_url: typeof window !== 'undefined' ? window.location.href : '/signup',
          timestamp: new Date().toISOString(),
          consent_text_version: CONSENT_TEXT_VERSION,
          disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
          consent_given: form.consent,
        } satisfies CompliancePayload,
      }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      toast.error(data.error ?? 'Unable to create account right now.')
      setLoading(false)
      return
    }

    setLoading(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full card text-center py-10">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Account Created!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Check your email for a confirmation link, then sign in to access your portal.
          </p>
          <Link href="/sign-in" className="btn-primary w-full py-3.5">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">SL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="text-gray-500 text-sm mt-1">Start your credit-building journey</p>
        </div>

        <div className="card shadow-sm">
          {/* Google OAuth */}
          <GoogleSignInButton redirectTo="/portal" label="Sign up with Google" />

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or create with email</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                name="full_name"
                type="text"
                className="input-field"
                placeholder="Jane Smith"
                value={form.full_name}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="label">Business Name</label>
              <input
                name="business_name"
                type="text"
                className="input-field"
                placeholder="Acme LLC"
                value={form.business_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="hidden" aria-hidden="true">
              <label className="label">Website</label>
              <input
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="label">Email Address</label>
              <input
                name="email"
                type="email"
                className="input-field"
                placeholder="you@company.com"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  className="input-field pr-12"
                  placeholder="Minimum 8 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <TurnstileWidget token={turnstileToken} onTokenChange={setTurnstileToken} />

            <PublicMessagingConsent
              checked={form.consent}
              onChange={(checked) => setForm((current) => ({ ...current, consent: checked }))}
            />

            <p className="text-xs text-gray-400 leading-relaxed">
              By creating an account, you agree that results are not guaranteed and this platform does not promise specific credit approvals, limits, or funding outcomes.
            </p>

            <button type="submit" className="btn-primary w-full py-3.5" disabled={loading || !form.consent || !turnstileEnabled || !turnstileToken}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/sign-in" className="text-green-600 font-semibold hover:text-green-700">
                Sign in
              </Link>
            </p>
            <PublicLegalLinks className="mt-3 text-xs text-gray-500 leading-relaxed" />
          </div>
        </div>

        <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} /> Back to home
        </Link>
      </div>
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
