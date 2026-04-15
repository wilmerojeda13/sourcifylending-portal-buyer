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

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const syncPartnerAttribution = async () => {
      try {
        await fetch('/api/auth/sync-partner-attribution', { method: 'POST' })
      } catch {
        // Keep auth confirmation resilient even if attribution sync fails.
      }
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
              void syncPartnerAttribution().finally(() => router.replace(next))
            }
          })
        return
      }
    }

    // PKCE flow — code in query param
    const code = searchParams.get('code')
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error('exchangeCodeForSession error:', error)
            router.replace(`/login?error=auth_confirm_failed`)
          } else {
            void syncPartnerAttribution().finally(() => router.replace(next))
          }
        })
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
