import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { logPortalEvent } from '@/lib/portal-events'

type DeleteAccountBody = {
  confirmText?: string
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as DeleteAccountBody
    const confirmText = body.confirmText?.trim().toLowerCase() ?? ''

    const supabase = await createServiceClient()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, business_name, feature_tier, billing_status, assigned_program')
      .eq('id', context.activeBusinessId)
      .single()

    if (profileError) throw profileError
    if (!profile?.email) {
      return NextResponse.json({ error: 'Account email is required to delete this account' }, { status: 400 })
    }

    if (confirmText !== profile.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Confirmation text does not match the account email' }, { status: 400 })
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', context.activeBusinessId)
      .maybeSingle()

    if (subscription?.stripe_subscription_id && subscription.status !== 'canceled') {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id)
    }

    await logPortalEvent({
      userId: context.activeBusinessId,
      eventType: 'account_deleted',
      category: 'accounts',
      title: 'Account deleted',
      message: `${profile.business_name || profile.full_name || profile.email || 'Member'} permanently deleted their self-serve account.`,
      severity: 'critical',
      metadata: {
        business_profile_id: context.activeBusinessId,
        full_name: profile.full_name ?? null,
        email: profile.email ?? null,
        business_name: profile.business_name ?? null,
        plan_tier: profile.feature_tier ?? null,
        subscription_status: profile.billing_status ?? null,
        assigned_program: profile.assigned_program ?? null,
      },
      sendEmail: true,
    })

    await Promise.all([
      supabase.from('profile_business_memberships').delete().eq('user_id', context.activeBusinessId),
      supabase.from('profile_business_memberships').delete().eq('business_profile_id', context.activeBusinessId),
      supabase.from('memberships').delete().eq('user_id', context.activeBusinessId),
      supabase.from('subscriptions').delete().eq('user_id', context.activeBusinessId),
      supabase.from('payment_arrangements').delete().eq('user_id', context.activeBusinessId),
      supabase.from('payment_records').delete().eq('user_id', context.activeBusinessId),
      supabase.from('notifications').delete().eq('user_id', context.activeBusinessId),
    ])

    const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', context.activeBusinessId)
    if (profileDeleteError) throw profileDeleteError

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete account error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete account'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
