'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { normalizeNextPath, ADMIN_POST_LOGIN_PATH } from '@/lib/auth-routing'

interface AdminLoginFormProps {
  nextPath?: string
}

export default function AdminLoginForm({ nextPath = ADMIN_POST_LOGIN_PATH }: AdminLoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient({ keepSignedIn })
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
      body: JSON.stringify({ event_type: 'admin_login' }),
    }).catch(() => {})

    // Redirect to admin post-login handler that checks admin status
    window.location.href = normalizeNextPath(nextPath, ADMIN_POST_LOGIN_PATH)
  }

  return (
    <div className="card shadow-lg bg-gray-800 border border-gray-700">
      <div className="text-sm text-gray-400 mb-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
        <p><strong>Admin access only.</strong> Non-admin accounts will be rejected.</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-200 mb-2">Email Address</label>
          <input
            type="email"
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-200 mb-2">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none pr-12"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-left cursor-pointer hover:border-gray-600">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-500 text-red-600 focus:ring-red-500 bg-gray-700 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-200">Keep Me Signed In</span>
            <span className="block text-xs leading-5 text-gray-400">
              Stay logged in on this device for faster access.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign In to Admin Portal'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-700 text-center space-y-3">
        <p className="text-xs text-gray-400">
          <Link href="https://www.sourcifylending.com" className="text-gray-300 hover:text-gray-200">
            Return to main site
          </Link>
        </p>
      </div>
    </div>
  )
}
