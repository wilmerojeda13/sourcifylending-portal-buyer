import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { account_user_id } = await req.json() as { account_user_id: string }
    if (!account_user_id) return NextResponse.json({ error: 'account_user_id required' }, { status: 400 })

    const supabase = await createServiceClient()

    // Verify the requester owns the account this delegate belongs to
    const { data: invite } = await supabase
      .from('account_users')
      .select('id, user_id, client_accounts(primary_owner_user_id)')
      .eq('id', account_user_id)
      .eq('role', 'delegate')
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Delegate not found' }, { status: 404 })

    const ownerUserId = (invite.client_accounts as unknown as { primary_owner_user_id: string } | null)?.primary_owner_user_id
    if (ownerUserId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Mark removed
    await supabase.from('account_users').update({
      status: 'removed',
      updated_at: new Date().toISOString(),
    }).eq('id', account_user_id)

    // Clear delegate flags from the delegate's profile (if they had accepted)
    if (invite.user_id) {
      await supabase.from('profiles').update({
        is_delegate: false,
        delegate_of_user_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', invite.user_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/delegate/remove error:', error)
    return NextResponse.json({ error: 'Failed to remove delegate' }, { status: 500 })
  }
}
