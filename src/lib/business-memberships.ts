export interface ProfileBusinessMembershipRow {
  user_id: string
  business_profile_id: string
}

export function excludeChildBusinessProfiles<T extends { id: string }>(
  profiles: T[],
  memberships: ProfileBusinessMembershipRow[],
) {
  const childBusinessIds = new Set(
    memberships
      .filter((row) => row.user_id !== row.business_profile_id)
      .map((row) => row.business_profile_id),
  )

  return profiles.filter((profile) => !childBusinessIds.has(profile.id))
}
