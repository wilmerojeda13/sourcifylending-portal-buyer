import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { linkCrmInviteAccount } from '@/lib/crm-invites'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    invite_id?: string | null
    user_id?: string | null
    profile_id?: string | null
    email?: string | null
  } | null

  if (!body?.invite_id || !body?.user_id || !body?.email) {
    return NextResponse.json({ error: 'invite_id, user_id, and email are required' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const result = await linkCrmInviteAccount(supabase, {
    inviteId: body.invite_id,
    userId: body.user_id,
    profileId: body.profile_id ?? body.user_id,
    email: body.email,
    createdBy: 'signup',
    metadata: { source: 'signup_form' },
  })

  return NextResponse.json({ ok: Boolean(result?.invite) })
}
