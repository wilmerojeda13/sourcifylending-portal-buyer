import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token } = await req.json() as { token: string }
    if (!token) return NextResponse.json({ error: 'invite token is required' }, { status: 400 })

    const supabase = await createServiceClient()

    // Find the invite row
    const { data: invite } = await supabase
      .from('account_users')
      .select('id, account_id, status, client_accounts(primary_owner_user_id)')
      .eq('invite_token', token)
      .eq('role', 'delegate')
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Invalid or expired invite link.' }, { status: 404 })
    if (invite.status === 'active') {
      return NextResponse.json({ error: 'This invite has already been accepted.' }, { status: 409 })
    }
    if (invite.status === 'removed') {
      return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 410 })
    }

    const ownerUserId = (invite.client_accounts as unknown as { primary_owner_user_id: string } | null)?.primary_owner_user_id

    if (ownerUserId === user.id) {
      return NextResponse.json({ error: 'You cannot accept your own invite.' }, { status: 400 })
    }

    // Accept: link this auth user to the invite row
    await supabase.from('account_users').update({
      user_id: user.id,
      status: 'active',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', invite.id)

    // Mark the delegate's profile
    await supabase.from('profiles').update({
      is_delegate: true,
      delegate_of_user_id: ownerUserId,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/delegate/accept error:', error)
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
  }
}
