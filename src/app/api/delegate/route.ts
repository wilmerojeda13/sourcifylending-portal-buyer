import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()

    // Check if user is a delegate
    const { data: delegateRow } = await supabase
      .from('account_users')
      .select('id, role, status, account_id, client_accounts(id, primary_owner_user_id)')
      .eq('user_id', user.id)
      .eq('role', 'delegate')
      .eq('status', 'active')
      .maybeSingle()

    if (delegateRow) {
      // Current user is a delegate — return owner info
      const ownerUserId = (delegateRow.client_accounts as unknown as { primary_owner_user_id: string } | null)?.primary_owner_user_id
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', ownerUserId!)
        .single()

      return NextResponse.json({
        role: 'delegate',
        account: {
          id: delegateRow.account_id,
          owner: { user_id: ownerUserId, name: ownerProfile?.full_name, email: ownerProfile?.email },
          delegate: null,
        },
      })
    }

    // Current user is an owner — get or create their client_account
    let { data: account } = await supabase
      .from('client_accounts')
      .select('id, primary_owner_user_id')
      .eq('primary_owner_user_id', user.id)
      .maybeSingle()

    if (!account) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('full_name, business_name')
        .eq('id', user.id)
        .single()

      const { data: newAccount } = await supabase
        .from('client_accounts')
        .insert({
          primary_owner_user_id: user.id,
          business_name: ownerProfile?.business_name ?? null,
        })
        .select('id, primary_owner_user_id')
        .single()

      if (newAccount) {
        await supabase.from('account_users').insert({
          account_id: newAccount.id,
          user_id: user.id,
          role: 'owner',
          status: 'active',
          invited_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
        })
        account = newAccount
      }
    }

    if (!account) {
      return NextResponse.json({ error: 'Failed to get account' }, { status: 500 })
    }

    // Get delegate row if any (not removed)
    const { data: delegateUser } = await supabase
      .from('account_users')
      .select('id, invited_email, status, invited_at, accepted_at, user_id')
      .eq('account_id', account.id)
      .eq('role', 'delegate')
      .neq('status', 'removed')
      .maybeSingle()

    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      role: 'owner',
      account: {
        id: account.id,
        owner: { user_id: user.id, name: ownerProfile?.full_name, email: ownerProfile?.email },
        delegate: delegateUser
          ? {
              id: delegateUser.id,
              email: delegateUser.invited_email,
              status: delegateUser.status,
              invited_at: delegateUser.invited_at,
              accepted_at: delegateUser.accepted_at,
              user_id: delegateUser.user_id,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('GET /api/delegate error:', error)
    return NextResponse.json({ error: 'Failed to fetch account users' }, { status: 500 })
  }
}
