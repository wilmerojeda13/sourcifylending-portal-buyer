'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import PublicLegalLinks from '@/components/compliance/PublicLegalLinks'

export default function LoginForm() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setLoading(false)
      const msg = error.message?.toLowerCase() ?? ''
      if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password')) {
        toast.error('Invalid email or password.')
      } else if (msg.includes('email not confirmed')) {
        toast.error('Please confirm your email before signing in.')
      } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
        toast.error('Too many attempts. Please wait a moment and try again.')
      } else {
        toast.error('Sign in failed. Please check your credentials and try again.')
      }
      return
    }

    // Fire-and-forget login event
    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'login' }),
    }).catch(() => {})

    window.location.href = '/dashboard'
  }

  return (
    <div className="card shadow-sm">
      {/* Google OAuth */}
      <GoogleSignInButton redirectTo="/dashboard" />

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-medium">or</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="label">Email Address</label>
          <input
            type="email"
            className="input-field"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="input-field pr-12"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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

        <button type="submit" className="btn-primary w-full py-3.5" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-100 text-center space-y-3">
        <p className="text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-green-600 font-semibold hover:text-green-700">
            Create one
          </Link>
        </p>
        <p className="text-sm text-gray-500">
          <Link href="/forgot-password" className="text-gray-500 hover:text-green-600">
            Forgot your password?
          </Link>
        </p>
        <p className="text-xs text-gray-400">
          New here?{' '}
          <Link href="/analyzer" className="text-green-600 hover:text-green-700">
            Run the free analyzer first
          </Link>
        </p>
        <PublicLegalLinks className="text-xs text-gray-400" />
      </div>
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
