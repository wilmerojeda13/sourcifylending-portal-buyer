'use client'
import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function AuthConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const next = searchParams.get('next') || '/dashboard'
    const adminEntry = searchParams.get('adminEntry') === 'true'

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const syncPartnerAttribution = () => {
      void fetch('/api/auth/sync-partner-attribution', { method: 'POST' }).catch(() => {})
    }

    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      // Implicit flow — magic link / email OTP tokens in hash fragment
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            if (error) {
              console.error('setSession error:', error)
              router.replace(`/login?error=auth_confirm_failed`)
            } else {
              syncPartnerAttribution()
              window.location.replace(next)
            }
          })
          .catch((error) => {
            console.error('setSession threw:', error)
            router.replace(`/login?error=auth_confirm_failed`)
          })
        return
      }
    }

    // PKCE flow — hand off to the server callback so the code verifier stays intact
    const code = searchParams.get('code')
    if (code) {
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('code', code)
      callbackUrl.searchParams.set('next', next)
      if (adminEntry) {
        callbackUrl.searchParams.set('adminEntry', 'true')
      }
      window.location.replace(callbackUrl.toString())
      return
    }

    // No tokens found — redirect to login
    router.replace(`/login?error=auth_confirm_failed`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Signing you in…</p>
      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Signing you in…</p>
          </div>
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  )
}
