'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    // Always redirect to reset-password page regardless of whether email exists
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    // Always show the same message — never reveal if email exists
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="text-2xl font-bold text-green-600">SourcifyLending</Link>
          </div>
          <div className="card shadow-sm text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Check your email</h1>
            <p className="text-sm text-gray-500">
              If an account exists for <strong>{email}</strong>, you&apos;ll receive a password reset link shortly.
            </p>
            <p className="text-xs text-gray-400">
              Didn&apos;t get it? Check your spam folder or{' '}
              <button
                onClick={() => setSubmitted(false)}
                className="text-green-600 hover:text-green-700 underline"
              >
                try again
              </button>
              .
            </p>
            <Link href="/login" className="btn-primary w-full py-3 block text-center mt-2">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-green-600">SourcifyLending</Link>
          <p className="text-gray-500 mt-1 text-sm">Reset your password</p>
        </div>
        <div className="card shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-1">Forgot your password?</h1>
          <p className="text-sm text-gray-500 mb-5">
            Enter your email and we&apos;ll send you a reset link if an account exists.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary w-full py-3.5" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <Link href="/login" className="text-sm text-gray-500 hover:text-green-600">
              ← Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
