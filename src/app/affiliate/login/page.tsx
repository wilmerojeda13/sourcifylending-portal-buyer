'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import PublicLegalLinks from '@/components/compliance/PublicLegalLinks'

const DEMO_EMAIL = 'affiliate@sourcifylending.com'
const DEMO_PASSWORD = 'AffiliateDemo123!'

export default function AffiliateLoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoLoaded, setDemoLoaded] = useState(false)

  const loadDemoCredentials = () => {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setDemoLoaded(true)
    setError(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    // Check affiliate record
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, status')
      .maybeSingle()

    if (!affiliate) {
      await supabase.auth.signOut()
      setError('This account is not registered as an affiliate. Contact us to apply.')
      setLoading(false)
      return
    }

    if (affiliate.status === 'suspended') {
      await supabase.auth.signOut()
      setError('Your affiliate account has been suspended. Please contact support.')
      setLoading(false)
      return
    }

    router.push('/affiliate/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 sm:p-5">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg sm:mb-4 sm:h-14 sm:w-14">
            <span className="text-lg font-bold text-white sm:text-xl">SL</span>
          </div>
          <h1 className="text-[1.7rem] font-bold leading-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
            SourcifyLending
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-gray-500 dark:text-gray-400 sm:mt-1 sm:text-sm">
            Partner Portal
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-8">
          <h2 className="mb-1 text-[1.05rem] font-bold leading-tight text-gray-900 dark:text-gray-100 sm:text-lg">Partner Login</h2>
          <p className="mb-5 text-[13px] leading-5 text-gray-500 dark:text-gray-400 sm:mb-6 sm:text-sm">Sign in to your partner account</p>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-[13px] leading-5 text-red-700 dark:text-red-400 sm:text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:focus:ring-indigo-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 pr-10 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:focus:ring-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                <>
                  <LogIn size={16} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Demo Account */}
        <div className="mt-4">
          <button
            type="button"
            onClick={loadDemoCredentials}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-800"
          >
            👁 View Demo Account
          </button>
          {demoLoaded && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] leading-4 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400 sm:text-xs">
              Demo credentials loaded — click Sign In to continue
            </p>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-5 space-y-2 text-center sm:mt-6">
          <p className="text-[13px] leading-5 text-gray-500 dark:text-gray-400 sm:text-sm">
            Want to become a partner?{' '}
            <a
              href="mailto:abel@sourcifylending.com"
              className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
            >
              Contact us
            </a>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            <Link href="/affiliate/signup" className="hover:text-gray-600 hover:underline dark:hover:text-gray-300">
              Apply to become a partner →
            </Link>
          </p>
          <PublicLegalLinks className="text-xs text-gray-400 dark:text-gray-500" />
        </div>
      </div>
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
