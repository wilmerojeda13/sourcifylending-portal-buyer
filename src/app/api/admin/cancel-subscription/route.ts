import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { logActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { user_id, stripe_subscription_id } = await req.json() as {
      user_id: string
      stripe_subscription_id: string
    }

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Guard: prevent canceling subscription for free plan users
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('feature_tier')
      .eq('id', user_id)
      .single()

    if (targetUser?.feature_tier === 'free') {
      return NextResponse.json(
        { error: 'Cannot cancel subscription for free plan users.' },
        { status: 400 }
      )
    }

    // Cancel in Stripe if we have a subscription ID
    if (stripe_subscription_id) {
      await stripe.subscriptions.cancel(stripe_subscription_id)
    }

    // Update local DB
    await supabase
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('user_id', user_id)

    await supabase
      .from('profiles')
      .update({ billing_status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', user_id)

    await logActivity(user_id, 'subscription_canceled', {
      admin_action: true,
      admin_email: user.email,
      stripe_subscription_id: stripe_subscription_id ?? null,
    }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin cancel-subscription error:', error)
    return NextResponse.json({ error: 'Cancellation failed' }, { status: 500 })
  }
}
