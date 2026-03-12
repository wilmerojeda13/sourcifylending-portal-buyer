'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

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
      toast.error(error.message)
      return
    }

    const cookies = document.cookie
    const hasSbCookie = cookies.includes('sb-')
    toast.success(`Signed in! Cookies set: ${hasSbCookie ? 'YES' : 'NO (MISSING!)'}`)
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 3000)
  }

  return (
    <div className="card shadow-sm">
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
        <p className="text-xs text-gray-400">
          New here?{' '}
          <Link href="/analyzer" className="text-green-600 hover:text-green-700">
            Run the free analyzer first
          </Link>
        </p>
      </div>
    </div>
  )
}
