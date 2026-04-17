import type { SupabaseClient } from '@supabase/supabase-js'

type MembershipLink = {
  user_id: string
  business_profile_id: string
}

export async function syncActiveBusinessProfile(
  supabase: SupabaseClient,
  profileId: string,
  now = new Date().toISOString(),
) {
  const { data, error } = await supabase
    .from('profile_business_memberships')
    .select('user_id, business_profile_id')
    .or(`user_id.eq.${profileId},business_profile_id.eq.${profileId}`)

  if (error) {
    throw error
  }

  const rows = (data ?? []) as MembershipLink[]
  const ownerIds = new Set<string>()

  for (const row of rows) {
    if (row.business_profile_id === profileId) {
      ownerIds.add(row.user_id)
    }
  }

  const isRootProfile = rows.some((row) => row.user_id === profileId && row.business_profile_id !== profileId)
  if (isRootProfile || rows.length === 0) {
    ownerIds.add(profileId)
  }

  await Promise.all(
    Array.from(ownerIds).map((ownerId) =>
      supabase
        .from('profiles')
        .update({
          active_business_profile_id: profileId,
          updated_at: now,
        })
        .eq('id', ownerId)
    ),
  )
}

export async function syncEditableBusinessProfile(
  supabase: SupabaseClient,
  ownerProfileId: string,
  patch: Record<string, unknown>,
) {
  const { data: ownerProfile, error: ownerError } = await supabase
    .from('profiles')
    .select('active_business_profile_id')
    .eq('id', ownerProfileId)
    .single<{ active_business_profile_id?: string | null }>()

  if (ownerError) {
    throw ownerError
  }

  const activeBusinessProfileId =
    typeof ownerProfile?.active_business_profile_id === 'string' && ownerProfile.active_business_profile_id !== ownerProfileId
      ? ownerProfile.active_business_profile_id
      : null

  let targetBusinessProfileId = activeBusinessProfileId

  if (!targetBusinessProfileId) {
    const { data: membershipRows, error: membershipError } = await supabase
      .from('profile_business_memberships')
      .select('business_profile_id, is_default')
      .eq('user_id', ownerProfileId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })

    if (membershipError) {
      throw membershipError
    }

    targetBusinessProfileId =
      membershipRows?.find((row) => row.business_profile_id !== ownerProfileId)?.business_profile_id ?? null
  }

  if (!targetBusinessProfileId) {
    return { targetBusinessProfileId: null }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetBusinessProfileId)

  if (updateError) {
    throw updateError
  }

  return { targetBusinessProfileId }
}
