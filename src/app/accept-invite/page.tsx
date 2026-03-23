'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { Loader2, CheckCircle2, XCircle, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

function AcceptInviteInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [authState, setAuthState] = useState<'loading' | 'authed' | 'anon'>('loading')
  const [accepting, setAccepting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Email/password login form state (for non-authed users)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const supabase = createClient()

  const acceptInvite = async () => {
    if (!token) { setError('Invalid invite link — token missing.'); return }
    setAccepting(true)
    try {
      const res = await fetch('/api/delegate/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.success) {
        setDone(true)
        setTimeout(() => { window.location.href = '/dashboard' }, 2000)
      } else {
        setError(data.error || 'Failed to accept invite.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setAccepting(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthState('authed')
        acceptInvite()
      } else {
        setAuthState('anon')
      }
    })

    // Watch for auth state changes (e.g. after Google OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && authState !== 'authed') {
        setAuthState('authed')
        acceptInvite()
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoginLoading(true)
    setError(null)
    try {
      const { error: authErr } = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              // Send the user back to THIS invite link after email confirmation
              // so acceptInvite() fires automatically when they return
              emailRedirectTo: `${window.location.origin}/accept-invite?token=${token}`,
            },
          })

      if (authErr) {
        setError(authErr.message)
        setLoginLoading(false)
        return
      }
      if (mode === 'signup') {
        toast.success('Account created! Check your email for a confirmation link — it will bring you straight back here to complete setup.')
        setLoginLoading(false)
        return
      }
      // On login, onAuthStateChange will fire and trigger acceptInvite()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoginLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <XCircle size={40} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite Link</h1>
          <p className="text-sm text-gray-500">This link is missing required information. Please ask the account owner to resend your invite.</p>
        </div>
      </div>
    )
  }

  if (authState === 'loading' || (authState === 'authed' && accepting)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <Loader2 size={36} className="text-green-500 animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {authState === 'loading' ? 'Checking your session…' : 'Accepting invite…'}
          </h1>
          <p className="text-sm text-gray-500">Please wait a moment.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">You're In!</h1>
          <p className="text-sm text-gray-500 mb-4">Your delegate access has been activated. Taking you to the portal now…</p>
          <Loader2 size={20} className="text-green-400 animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <XCircle size={40} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invite Error</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <a href="/login" className="text-sm text-green-600 underline">Go to login</a>
        </div>
      </div>
    )
  }

  // Not authed — show login/signup form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Accept Delegate Invite</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            {mode === 'login'
              ? 'Sign in to your existing account to accept this invite.'
              : 'Create a new account to accept this invite.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {/* Google */}
          <GoogleSignInButton
            redirectTo={`/accept-invite?token=${token}`}
            label={mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
          />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
            />

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              {loginLoading ? <Loader2 size={15} className="animate-spin" /> : null}
              {mode === 'login' ? 'Sign In & Accept Invite' : 'Create Account & Accept Invite'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500">
            {mode === 'login' ? (
              <>Don&apos;t have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(null) }} className="text-green-600 font-semibold">Create one</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null) }} className="text-green-600 font-semibold">Sign in</button>
              </>
            )}
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          You&apos;re accepting a delegate access invite from a SourcifyLending client.
        </p>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-green-500" />
      </div>
    }>
      <AcceptInviteInner />
    </Suspense>
  )
}
