import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { buildOAuthCallbackUrl, normalizeNextPath } from '@/lib/auth-routing'
import { SITE_URL } from '@/lib/site-config'

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPkceVerifier() {
  return base64Url(randomBytes(32))
}

function createPkceChallenge(verifier: string) {
  return base64Url(createHash('sha256').update(verifier).digest())
}

function getProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  try {
    const host = new URL(url).hostname
    return host.split('.')[0] || 'supabase'
  } catch {
    return 'supabase'
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = normalizeNextPath(searchParams.get('next'))
  const adminEntry = searchParams.get('adminEntry') === 'true'
  const callbackUrl = buildOAuthCallbackUrl(origin || SITE_URL, next, adminEntry)
  const isSecure = (origin || SITE_URL).startsWith('https://')

  const verifier = createPkceVerifier()
  const challenge = createPkceChallenge(verifier)
  const projectRef = getProjectRef()
  const storageKey = `sb-${projectRef}-auth-token`

  const authorizeUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize`)
  authorizeUrl.searchParams.set('provider', 'google')
  authorizeUrl.searchParams.set('redirect_to', callbackUrl)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 's256')
  authorizeUrl.searchParams.set('access_type', 'offline')
  authorizeUrl.searchParams.set('prompt', 'consent select_account')

  const response = NextResponse.redirect(authorizeUrl.toString())
  response.cookies.set({
    name: `${storageKey}-code-verifier`,
    value: `base64-${base64Url(JSON.stringify(verifier))}`,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: isSecure,
    maxAge: 10 * 60,
  })

  return response
}
