import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, t } from '@/lib/i18n'
import Link from 'next/link'
import MembersTable from './MembersTable'
import { excludeChildBusinessProfiles } from '@/lib/business-memberships'

export default async function AdminMembersPage() {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const [{ data: profiles }, { data: subscriptions }, { data: allMemberships }, { data: businessMemberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, business_name, feature_tier, member_status, billing_status, assigned_program, current_stage, portal_blocked, suspicious_signup, suspicious_signup_reason, signup_risk_score, is_demo, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end'),
    supabase.from('memberships').select('user_id, program_code, status').eq('status', 'active'),
    supabase.from('profile_business_memberships').select('user_id, business_profile_id').eq('status', 'active'),
  ])

  const rawProfiles = profiles ?? []
  const filteredProfiles = excludeChildBusinessProfiles(rawProfiles, businessMemberships ?? [])

  const filterLooksBroken =
    rawProfiles.length > 0 &&
    filteredProfiles.length === 0 &&
    (businessMemberships?.length ?? 0) > 0

  if (filterLooksBroken) {
    console.error('[admin/members] profile_business_memberships filter removed every profile; falling back to raw profiles')
  }

  const primaryProfiles = filterLooksBroken ? rawProfiles : filteredProfiles

  const subMap = new Map((subscriptions ?? []).map((subscription) => [subscription.user_id, subscription]))

  const membershipMap = new Map<string, string[]>()
  for (const membership of allMemberships ?? []) {
    if (!membershipMap.has(membership.user_id)) membershipMap.set(membership.user_id, [])
    membershipMap.get(membership.user_id)!.push(membership.program_code)
  }

  const businessCountMap = new Map<string, number>()
  for (const membership of businessMemberships ?? []) {
    businessCountMap.set(membership.user_id, (businessCountMap.get(membership.user_id) ?? 0) + 1)
  }

  const members = primaryProfiles.map((profile) => {
    const subscription = subMap.get(profile.id)
    return {
      id: profile.id,
      full_name: profile.full_name ?? '',
      email: profile.email ?? '',
      business_name: profile.business_name ?? null,
      feature_tier: profile.feature_tier ?? 'free',
      member_status: profile.member_status ?? 'prospect',
      billing_status: profile.billing_status ?? 'inactive',
      assigned_program: profile.assigned_program ?? null,
      active_programs: membershipMap.get(profile.id) ?? [],
      current_stage: profile.current_stage ?? null,
      portal_blocked: profile.portal_blocked ?? false,
      suspicious_signup: profile.suspicious_signup ?? false,
      suspicious_signup_reason: profile.suspicious_signup_reason ?? null,
      signup_risk_score: profile.signup_risk_score ?? null,
      is_demo: profile.is_demo ?? false,
      created_at: profile.created_at,
      stripe_subscription_id: subscription?.stripe_subscription_id ?? null,
      stripe_customer_id: subscription?.stripe_customer_id ?? null,
      stripe_status: subscription?.status ?? null,
      current_period_end: subscription?.current_period_end ?? null,
      business_count: businessCountMap.get(profile.id) ?? 1,
    }
  })

  const stats = {
    total: members.length,
    active: members.filter((member) => member.billing_status === 'active').length,
    trialing: members.filter((member) => member.billing_status === 'trialing').length,
    canceled: members.filter((member) => member.billing_status === 'canceled').length,
    inactive: members.filter((member) => member.billing_status === 'inactive').length,
    blocked: members.filter((member) => member.portal_blocked).length,
    suspicious: members.filter((member) => member.suspicious_signup).length,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text('admin.membershipManagement', 'Membership Management')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{text('admin.membershipSubtitle', 'Manage subscriptions, programs, and access for all members')}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              ← {text('admin.adminHub', 'Admin Hub')}
            </Link>
            <a
              href="/admin/opportunities"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              {text('admin.opportunities', 'Opportunities')} →
            </a>
            <a
              href="/admin/chargeback-defense"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              {text('admin.chargebackDefense', 'Chargeback Defense')} →
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
          {[
            { label: text('admin.total', 'Total'), value: stats.total, color: 'text-gray-900 dark:text-white' },
            { label: text('admin.active', 'Active'), value: stats.active, color: 'text-green-600' },
            { label: text('admin.trialing', 'Trialing'), value: stats.trialing, color: 'text-blue-600' },
            { label: text('admin.canceled', 'Canceled'), value: stats.canceled, color: 'text-red-500' },
            { label: text('admin.inactive', 'Inactive'), value: stats.inactive, color: 'text-gray-400' },
            { label: text('admin.blocked', 'Blocked'), value: stats.blocked, color: 'text-red-700' },
            { label: text('admin.suspicious', 'Suspicious'), value: stats.suspicious, color: 'text-amber-700' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-center shadow-sm dark:shadow-gray-900"
            >
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <MembersTable members={members} />
      </div>
    </div>
  )
}
