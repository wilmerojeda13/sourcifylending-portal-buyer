export const dynamic = 'force-dynamic'

import ClaimAccountClient from './ClaimAccountClient'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { SUPPORT_EMAIL } from '@/lib/site-config'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

function ErrorCard({ title, message, linkLabel, linkHref }: {
  title: string
  message: string
  linkLabel: string
  linkHref: string
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <Link href={linkHref} className="text-sm text-green-600 hover:text-green-700 font-medium">
          {linkLabel}
        </Link>
      </div>
    </div>
  )
}

export default async function ClaimAccountPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) {
    return (
      <ErrorCard
        title="Invalid Link"
        message="This invite link is missing or invalid. Please contact SourcifyLending support for a new invite."
        linkLabel="Go to Login →"
        linkHref="/login"
      />
    )
  }

  // Validate token directly via Supabase — no internal HTTP fetch needed
  const supabase = await createServiceClient()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, business_name, invite_status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (error || !profile) {
    return (
      <ErrorCard
        title="Invalid Link"
        message="This invite link is expired or invalid. Please contact SourcifyLending support for a new invite."
        linkLabel="Contact Support →"
        linkHref={`mailto:${SUPPORT_EMAIL}`}
      />
    )
  }

  if (profile.invite_status === 'accepted') {
    return (
      <ErrorCard
        title="Already Claimed"
        message="This invite link has already been used. Please sign in with your credentials."
        linkLabel="Go to Login →"
        linkHref="/login"
      />
    )
  }

  if (profile.invite_expires_at && new Date(profile.invite_expires_at) < new Date()) {
    return (
      <ErrorCard
        title="Link Expired"
        message="This invite link has expired (links are valid for 7 days). Please contact SourcifyLending to get a new invite."
        linkLabel="Contact Support →"
        linkHref={`mailto:${SUPPORT_EMAIL}`}
      />
    )
  }

  return (
    <ClaimAccountClient
      token={token}
      fullName={profile.full_name ?? ''}
      email={profile.email ?? ''}
      businessName={profile.business_name ?? null}
    />
  )
}
