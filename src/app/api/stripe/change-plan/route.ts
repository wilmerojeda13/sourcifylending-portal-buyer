import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe, PRICE_IDS } from '@/lib/stripe'
import type { ProgramId } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { new_program } = await req.json() as { new_program: ProgramId }

    const validPrograms: ProgramId[] = ['program_a', 'program_b', 'program_c']
    if (!validPrograms.includes(new_program)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Admin bypass — no Stripe subscription required, just update the profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profile?.is_admin) {
      await supabase
        .from('profiles')
        .update({ assigned_program: new_program, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      return NextResponse.json({ success: true, new_program })
    }

    // Get user's current subscription from our DB
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, program')
      .eq('user_id', user.id)
      .single()

    if (!sub?.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    if (sub.program === new_program) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
    }

    // Get the new monthly price ID
    const newPriceId = PRICE_IDS[new_program]?.monthly
    if (!newPriceId) {
      return NextResponse.json({ error: 'Price not configured for this program' }, { status: 500 })
    }

    // Retrieve current subscription from Stripe to get the subscription item ID
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)

    // Find the current monthly recurring item (not setup fee)
    const currentItem = stripeSub.items.data.find(
      (item) => item.price.recurring !== null
    )

    if (!currentItem) {
      return NextResponse.json({ error: 'Could not find subscription item to update' }, { status: 500 })
    }

    // Update the subscription with the new price, prorating immediately
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    })

    // Update our DB record
    await supabase
      .from('subscriptions')
      .update({ program: new_program })
      .eq('user_id', user.id)

    // Also update the user's profile
    await supabase
      .from('profiles')
      .update({ assigned_program: new_program })
      .eq('id', user.id)

    return NextResponse.json({ success: true, new_program })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Change plan error:', errMsg)
    return NextResponse.json({ error: `Failed to change plan: ${errMsg}` }, { status: 500 })
  }
}
