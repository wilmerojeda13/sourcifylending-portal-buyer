import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMissingRelationError, isSchemaDriftError } from '@/lib/supabase-schema'
import type { AccountState, ProgramId, SubscriptionStatus, UserProfile } from '@/types'
import { redirect } from 'next/navigation'

export const ACTIVE_BUSINESS_COOKIE = 'sl_active_business'

type MinimalProfile = UserProfile & {
  active_business_profile_id?: string | null
}

type MembershipRow = {
  business_profile_id: string
  role: 'owner' | 'admin' | 'member' | 'delegate'
  status: 'active' | 'inactive'
  is_default: boolean
  business_profile?: MinimalProfile | MinimalProfile[] | null
}

export interface AccessibleBusiness {
  id: string
  label: string
  program: ProgramId | null
  role: 'owner' | 'admin' | 'member' | 'delegate'
  member_status: AccountState
  feature_tier: 'free' | 'paid'
  billing_status: SubscriptionStatus
  portal_blocked: boolean
  is_default: boolean
}

export interface BusinessContext {
  userId: string
  viewerProfile: MinimalProfile
  activeBusinessId: string
  activeProfile: MinimalProfile
  activeRole: 'owner' | 'admin' | 'member' | 'delegate'
  businesses: AccessibleBusiness[]
  hasMultipleBusinesses: boolean
}

function labelForProfile(profile: MinimalProfile) {
  return profile.business_name?.trim() || profile.full_name?.trim() || 'Business Account'
}

function toSingleProfile(input: MinimalProfile | MinimalProfile[] | null | undefined) {
  if (!input) return null
  return Array.isArray(input) ? input[0] ?? null : input
}

function toAccessibleBusiness(profile: MinimalProfile, row?: MembershipRow): AccessibleBusiness {
  return {
    id: profile.id,
    label: labelForProfile(profile),
    program: profile.assigned_program,
    role: row?.role ?? 'owner',
    member_status: profile.member_status,
    feature_tier: profile.feature_tier ?? 'free',
    billing_status: profile.billing_status,
    portal_blocked: profile.portal_blocked,
    is_default: row?.is_default ?? false,
  }
}

async function loadMembershipRows(userId: string) {
  const serviceClient = await createServiceClient()
  const selectClause = `
    business_profile_id,
    role,
    status,
    is_default,
    business_profile:profiles!profile_business_memberships_business_profile_id_fkey(
      id,
      full_name,
      business_name,
      assigned_program,
      member_status,
      feature_tier,
      portal_blocked,
      is_demo,
      is_admin,
      billing_status
    )
  `

  const current = await serviceClient
    .from('profile_business_memberships')
    .select(selectClause)
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!current.error) {
    return { rows: (current.data ?? []) as MembershipRow[] }
  }

  if (!isSchemaDriftError(current.error, 'user_id')) {
    throw current.error
  }

  const legacy = await serviceClient
    .from('profile_business_memberships')
    .select(selectClause)
    .eq('auth_user_id', userId)
    .eq('status', 'active')

  if (legacy.error && !isMissingRelationError(legacy.error, 'profile_business_memberships')) {
    throw legacy.error
  }

  return {
    rows: (legacy.data ?? []) as MembershipRow[],
  }
}

export async function getBusinessContext(preferredBusinessId?: string | null): Promise<BusinessContext | null> {
  const authClient = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const cookieBusinessId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value ?? null

  let viewerProfile: MinimalProfile | null = null
  const viewerProfileResult = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<MinimalProfile>()
  viewerProfile = viewerProfileResult.data

  if (!viewerProfile) {
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || ''
    const now = new Date().toISOString()

    const { error: bootstrapError } = await serviceClient.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: fullName,
      feature_tier: 'free',
      billing_status: 'inactive',
      member_status: 'prospect',
      acquisition_path: 'self_serve',
      progress_percentage: 0,
      nsf_flag: false,
      portal_blocked: false,
      created_at: now,
      updated_at: now,
    })

    if (!bootstrapError) {
      const { data: bootstrapProfile } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single<MinimalProfile>()

      viewerProfile = bootstrapProfile ?? null
    }
  }

  if (!viewerProfile) return null

  let membershipRows: MembershipRow[] = []
  try {
    const membershipResult = await loadMembershipRows(user.id)
    membershipRows = membershipResult.rows
  } catch (error) {
    if (!isMissingRelationError(error as { message?: string | null }, 'profile_business_memberships')) {
      throw error
    }
  }

  const fallbackSelf = toAccessibleBusiness(viewerProfile, {
    business_profile_id: viewerProfile.id,
    role: 'owner',
    status: 'active',
    is_default: true,
  })

  const businesses = membershipRows.length > 0
    ? membershipRows
        .map((row) => {
          const businessProfile = toSingleProfile(row.business_profile)
          return businessProfile ? toAccessibleBusiness(businessProfile, row) : null
        })
        .filter((row): row is AccessibleBusiness => !!row)
    : [fallbackSelf]

  if (!businesses.some((business) => business.id === viewerProfile.id)) {
    businesses.unshift(fallbackSelf)
  }

  const requestedBusinessId =
    preferredBusinessId ??
    cookieBusinessId ??
    viewerProfile.active_business_profile_id ??
    businesses.find((business) => business.is_default)?.id ??
    businesses[0]?.id ??
    viewerProfile.id

  const activeBusiness = businesses.find((business) => business.id === requestedBusinessId) ?? businesses[0] ?? fallbackSelf

  let activeProfile = viewerProfile
  if (activeBusiness.id !== viewerProfile.id) {
    const { data } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', activeBusiness.id)
      .single<MinimalProfile>()

    if (data) {
      activeProfile = {
        ...data,
        active_business_profile_id: viewerProfile.active_business_profile_id ?? null,
      }
    }
  }

  return {
    userId: user.id,
    viewerProfile,
    activeBusinessId: activeBusiness.id,
    activeProfile,
    activeRole: activeBusiness.role,
    businesses,
    hasMultipleBusinesses: businesses.length > 1,
  }
}

export async function requireBusinessContext(preferredBusinessId?: string | null) {
  const context = await getBusinessContext(preferredBusinessId)
  if (!context) {
    throw new Error('UNAUTHORIZED')
  }
  return context
}

export function isSameBusinessSelection(context: BusinessContext, businessId: string) {
  return context.businesses.some((business) => business.id === businessId)
}

export async function requirePortalPageContext(nextPath = '/portal') {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  }

  const context = await getBusinessContext()
  if (!context) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  }

  const supabase = await createServiceClient()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', context.activeBusinessId)
    .eq('read', false)

  const { data: memberships } = await supabase
    .from('memberships')
    .select('program_code')
    .eq('user_id', context.activeBusinessId)
    .eq('status', 'active')

  const allPrograms = (memberships ?? []).map((membership: { program_code: string }) => membership.program_code).filter(Boolean)

  return {
    supabase,
    authSupabase: authClient,
    authUser: user,
    userId: context.userId,
    activeBusinessId: context.activeBusinessId,
    activeProfile: context.activeProfile,
    viewerProfile: context.viewerProfile,
    activeRole: context.activeRole,
    businesses: context.businesses,
    hasMultipleBusinesses: context.hasMultipleBusinesses,
    notificationCount: notifications?.length ?? 0,
    activePrograms: allPrograms.length > 0 ? allPrograms : (context.activeProfile.assigned_program ? [context.activeProfile.assigned_program] : []),
  }
}
