import ClaimAccountClient from './ClaimAccountClient'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function ClaimAccountPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-500 mb-6">This invite link is missing or invalid. Please contact SourcifyLending support for a new invite.</p>
          <Link href="/login" className="text-sm text-green-600 hover:text-green-700 font-medium">
            Go to Login →
          </Link>
        </div>
      </div>
    )
  }

  // Validate the token server-side
  let tokenData: { valid: boolean; full_name?: string; email?: string; business_name?: string; reason?: string } = { valid: false }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/claim-account?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    tokenData = await res.json()
  } catch {
    tokenData = { valid: false }
  }

  if (!tokenData.valid) {
    const isExpired = tokenData.reason === 'expired'
    const isClaimed = tokenData.reason === 'already_claimed'

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isClaimed ? 'Already Claimed' : isExpired ? 'Link Expired' : 'Invalid Link'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isClaimed
              ? 'This invite link has already been used. Please sign in with your credentials.'
              : isExpired
              ? 'This invite link has expired (links are valid for 72 hours). Please contact SourcifyLending to get a new invite.'
              : 'This invite link is expired or invalid. Please contact SourcifyLending support for a new invite.'}
          </p>
          <Link href="/login" className="text-sm text-green-600 hover:text-green-700 font-medium">
            {isClaimed ? 'Go to Login →' : 'Contact Support →'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <ClaimAccountClient
      token={token}
      fullName={tokenData.full_name ?? ''}
      email={tokenData.email ?? ''}
      businessName={tokenData.business_name ?? null}
    />
  )
}
