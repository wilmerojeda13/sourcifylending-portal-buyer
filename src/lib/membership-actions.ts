import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { syncActiveBusinessProfile } from '@/lib/admin-business-sync'
import { logPortalEvent } from '@/lib/portal-events'

type MembershipMode = 'downgrade' | 'cancel'

export async function applyMembershipChange(
  supabase: SupabaseClient,
  businessProfileId: string,
  mode: MembershipMode,
) {
  const now = new Date().toISOString()

  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, business_name, assigned_program, feature_tier, billing_status, member_status')
      .eq('id', businessProfileId)
      .single(),
    supabase
      .from('subscriptions')
      .select('id, status, stripe_subscription_id, stripe_customer_id, program')
      .eq('user_id', businessProfileId)
      .maybeSingle(),
  ])

  if (profileError) throw profileError
  if (subscriptionError) throw subscriptionError

  const stripeSubscriptionId = subscription?.stripe_subscription_id
  if (stripeSubscriptionId && subscription?.status !== 'canceled') {
    await stripe.subscriptions.cancel(stripeSubscriptionId)
  }

  const isDowngrade = mode === 'downgrade'

  const profileUpdate = isDowngrade
    ? {
        feature_tier: 'free' as const,
        billing_status: 'inactive' as const,
        member_status: 'prospect' as const,
        assigned_program: null,
        updated_at: now,
      }
    : {
        feature_tier: 'paid' as const,
        billing_status: 'canceled' as const,
        member_status: 'active_member' as const,
        updated_at: now,
      }

  const subscriptionUpdate = isDowngrade
    ? {
        user_id: businessProfileId,
        status: 'inactive',
        program: null,
        updated_at: now,
      }
    : {
        user_id: businessProfileId,
        status: 'canceled',
        program: profile?.assigned_program ?? null,
        updated_at: now,
      }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', businessProfileId)

  if (profileUpdateError) throw profileUpdateError

  if (subscription) {
    const { error: subscriptionUpdateError } = await supabase
      .from('subscriptions')
      .update(subscriptionUpdate)
      .eq('user_id', businessProfileId)

    if (subscriptionUpdateError) throw subscriptionUpdateError
  } else {
    const { error: subscriptionInsertError } = await supabase
      .from('subscriptions')
      .insert({
        ...subscriptionUpdate,
        created_at: now,
      })

    if (subscriptionInsertError) throw subscriptionInsertError
  }

  const { error: membershipUpdateError } = await supabase
    .from('memberships')
    .update({
      status: 'canceled',
      updated_at: now,
    })
    .eq('user_id', businessProfileId)
    .eq('status', 'active')

  if (membershipUpdateError) throw membershipUpdateError

  await syncActiveBusinessProfile(supabase, businessProfileId, now)

  await logPortalEvent({
    userId: businessProfileId,
    eventType: isDowngrade ? 'subscription_downgraded' : 'subscription_canceled',
    category: 'billing',
    title: isDowngrade ? 'Membership downgraded to Free Plan' : 'Membership canceled',
    message: isDowngrade
      ? `${profile?.business_name || profile?.full_name || profile?.email || 'Member'} downgraded to the Free Plan from ${profile?.assigned_program ?? 'no assigned program'}.`
      : `${profile?.business_name || profile?.full_name || profile?.email || 'Member'} canceled their paid membership from ${profile?.assigned_program ?? 'no assigned program'}.`,
    severity: isDowngrade ? 'warning' : 'critical',
    metadata: {
      business_profile_id: businessProfileId,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      business_name: profile?.business_name ?? null,
      previous_plan_tier: profile?.feature_tier ?? null,
      previous_subscription_status: profile?.billing_status ?? null,
      previous_assigned_program: profile?.assigned_program ?? null,
      new_plan_tier: profileUpdate.feature_tier,
      new_subscription_status: profileUpdate.billing_status,
      new_assigned_program: profileUpdate.assigned_program ?? null,
    },
    sendEmail: true,
  })

  return {
    profile: {
      id: businessProfileId,
      ...profileUpdate,
    },
    subscription: subscriptionUpdate,
  }
}
