import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import MemberDetail from './MemberDetail'
import Link from 'next/link'
import type { AccountState, ProgramId, ReadinessStatus, SubscriptionStatus, UserProfile } from '@/types'

type ManagedBusinessRecord = {
  id: string
  full_name: string | null
  business_name: string | null
  entity_type: string | null
  industry: string | null
  assigned_program: string | null
  subscription_status: string | null
  account_state: string | null
  portal_blocked: boolean | null
  created_at: string | null
}

function normalizeMemberProfile(profile: Record<string, unknown>): UserProfile & {
  stripe_customer_id?: string | undefined
  active_programs?: string[]
  suspicious_signup?: boolean
  suspicious_signup_reason?: string | null
  signup_risk_score?: number | null
} {
  return {
    ...profile,
    id: typeof profile.id === 'string' ? profile.id : '',
    full_name: typeof profile.full_name === 'string' ? profile.full_name : '',
    email: typeof profile.email === 'string' ? profile.email : '',
    business_name: typeof profile.business_name === 'string' ? profile.business_name : null,
    business_age: typeof profile.business_age === 'string' ? profile.business_age : null,
    entity_type: typeof profile.entity_type === 'string' ? profile.entity_type : null,
    industry: typeof profile.industry === 'string' ? profile.industry : null,
    monthly_revenue_range: typeof profile.monthly_revenue_range === 'string' ? profile.monthly_revenue_range : null,
    monthly_deposit_range: typeof profile.monthly_deposit_range === 'string' ? profile.monthly_deposit_range : null,
    nsf_flag: Boolean(profile.nsf_flag),
    credit_score_range: typeof profile.credit_score_range === 'string' ? profile.credit_score_range : null,
    utilization_range: typeof profile.utilization_range === 'string' ? profile.utilization_range : null,
    inquiry_range: typeof profile.inquiry_range === 'string' ? profile.inquiry_range : null,
    business_credit_reporting_status: typeof profile.business_credit_reporting_status === 'string' ? profile.business_credit_reporting_status : null,
    assigned_program: (typeof profile.assigned_program === 'string' ? profile.assigned_program : null) as ProgramId | null,
    readiness_status: (typeof profile.readiness_status === 'string' ? profile.readiness_status : null) as ReadinessStatus | null,
    current_stage: typeof profile.current_stage === 'string' ? profile.current_stage : null,
    next_task_id: typeof profile.next_task_id === 'string' ? profile.next_task_id : null,
    progress_percentage: typeof profile.progress_percentage === 'number' ? profile.progress_percentage : 0,
    subscription_status: (typeof profile.subscription_status === 'string' ? profile.subscription_status : 'inactive') as SubscriptionStatus,
    plan_tier: (typeof profile.plan_tier === 'string' && (profile.plan_tier === 'free' || profile.plan_tier === 'paid') ? profile.plan_tier : 'free') as any,
    portal_blocked: Boolean(profile.portal_blocked),
    is_demo: Boolean(profile.is_demo),
    is_admin: Boolean(profile.is_admin),
    admin_notes: typeof profile.admin_notes === 'string' ? profile.admin_notes : null,
    notion_page_id: typeof profile.notion_page_id === 'string' ? profile.notion_page_id : null,
    ai_suspended: Boolean(profile.ai_suspended),
    ai_custom_monthly_credits: typeof profile.ai_custom_monthly_credits === 'number' ? profile.ai_custom_monthly_credits : null,
    ai_custom_daily_cap: typeof profile.ai_custom_daily_cap === 'number' ? profile.ai_custom_daily_cap : null,
    ai_custom_heavy_limit: typeof profile.ai_custom_heavy_limit === 'number' ? profile.ai_custom_heavy_limit : null,
    ai_access_notes: typeof profile.ai_access_notes === 'string' ? profile.ai_access_notes : null,
    account_state: (typeof profile.account_state === 'string' ? profile.account_state : 'prospect') as AccountState,
    lead_id: typeof profile.lead_id === 'string' ? profile.lead_id : null,
    latest_analyzer_result: profile.latest_analyzer_result && typeof profile.latest_analyzer_result === 'object' ? profile.latest_analyzer_result as UserProfile['latest_analyzer_result'] : null,
    analyzed_at: typeof profile.analyzed_at === 'string' ? profile.analyzed_at : null,
    acquisition_path: profile.acquisition_path === 'partner_assisted' ? 'partner_assisted' : 'self_serve',
    assigned_partner_affiliate_id: typeof profile.assigned_partner_affiliate_id === 'string' ? profile.assigned_partner_affiliate_id : null,
    assigned_partner_name: typeof profile.assigned_partner_name === 'string' ? profile.assigned_partner_name : null,
    partner_relationship_started_at: typeof profile.partner_relationship_started_at === 'string' ? profile.partner_relationship_started_at : null,
    partner_onboarding_status: typeof profile.partner_onboarding_status === 'string' ? profile.partner_onboarding_status as UserProfile['partner_onboarding_status'] : null,
    delegate_access_authorized: Boolean(profile.delegate_access_authorized),
    active_business_profile_id: typeof profile.active_business_profile_id === 'string' ? profile.active_business_profile_id : null,
    created_at: typeof profile.created_at === 'string' ? profile.created_at : new Date(0).toISOString(),
    updated_at: typeof profile.updated_at === 'string' ? profile.updated_at : new Date(0).toISOString(),
    underwriting_completed_at: typeof profile.underwriting_completed_at === 'string' ? profile.underwriting_completed_at : null,
    underwriting_next_due_at: typeof profile.underwriting_next_due_at === 'string' ? profile.underwriting_next_due_at : null,
    underwriting_review_count: typeof profile.underwriting_review_count === 'number' ? profile.underwriting_review_count : 0,
    underwriting_program: typeof profile.underwriting_program === 'string' ? profile.underwriting_program : null,
    uw_approval_likelihood: typeof profile.uw_approval_likelihood === 'string' ? profile.uw_approval_likelihood as UserProfile['uw_approval_likelihood'] : null,
    uw_risk_score: typeof profile.uw_risk_score === 'number' ? profile.uw_risk_score : null,
    uw_risk_level: typeof profile.uw_risk_level === 'string' ? profile.uw_risk_level as UserProfile['uw_risk_level'] : null,
    uw_ai_summary: typeof profile.uw_ai_summary === 'string' ? profile.uw_ai_summary : null,
    uw_ai_recommendations: Array.isArray(profile.uw_ai_recommendations) ? profile.uw_ai_recommendations.filter((item): item is string => typeof item === 'string') : [],
    uw_disqualification_reason: typeof profile.uw_disqualification_reason === 'string' ? profile.uw_disqualification_reason : null,
    uw_key_issues: Array.isArray(profile.uw_key_issues) ? profile.uw_key_issues.filter((item): item is string => typeof item === 'string') : [],
    uw_next_accounts: Array.isArray(profile.uw_next_accounts) ? profile.uw_next_accounts.filter((item): item is string => typeof item === 'string') : [],
    uw_estimated_funding_range: typeof profile.uw_estimated_funding_range === 'string' ? profile.uw_estimated_funding_range : null,
    uw_recommended_issuers: Array.isArray(profile.uw_recommended_issuers) ? profile.uw_recommended_issuers.filter((item): item is string => typeof item === 'string') : [],
    uw_prev_approval_likelihood: typeof profile.uw_prev_approval_likelihood === 'string' ? profile.uw_prev_approval_likelihood : null,
    uw_prev_risk_score: typeof profile.uw_prev_risk_score === 'number' ? profile.uw_prev_risk_score : null,
    uw_prev_stage: typeof profile.uw_prev_stage === 'string' ? profile.uw_prev_stage : null,
    uw_annual_revenue_conf: typeof profile.uw_annual_revenue_conf === 'string' ? profile.uw_annual_revenue_conf : null,
    uw_average_daily_balance: typeof profile.uw_average_daily_balance === 'string' ? profile.uw_average_daily_balance : null,
    uw_bank_statement_months: typeof profile.uw_bank_statement_months === 'string' ? profile.uw_bank_statement_months : null,
    uw_outstanding_balances: typeof profile.uw_outstanding_balances === 'string' ? profile.uw_outstanding_balances : null,
    uw_recent_derogatory: Boolean(profile.uw_recent_derogatory),
    uw_public_records: Boolean(profile.uw_public_records),
    uw_time_in_business_conf: typeof profile.uw_time_in_business_conf === 'string' ? profile.uw_time_in_business_conf : null,
    uw_card_application_strategy: typeof profile.uw_card_application_strategy === 'string' ? profile.uw_card_application_strategy : null,
    uw_existing_card_balances: typeof profile.uw_existing_card_balances === 'string' ? profile.uw_existing_card_balances : null,
    uw_authorized_user_status: Boolean(profile.uw_authorized_user_status),
    uw_duns_status: typeof profile.uw_duns_status === 'string' ? profile.uw_duns_status : null,
    uw_ein_open_date: typeof profile.uw_ein_open_date === 'string' ? profile.uw_ein_open_date : null,
    uw_vendor_tier_readiness: typeof profile.uw_vendor_tier_readiness === 'string' ? profile.uw_vendor_tier_readiness : null,
    suspicious_signup: Boolean(profile.suspicious_signup),
    suspicious_signup_reason: typeof profile.suspicious_signup_reason === 'string' ? profile.suspicious_signup_reason : null,
    signup_risk_score: typeof profile.signup_risk_score === 'number' ? profile.signup_risk_score : null,
    stripe_customer_id: typeof profile.stripe_customer_id === 'string' ? profile.stripe_customer_id : undefined,
  }
}

export default async function AdminMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/dashboard')

  const supabase = await createServiceClient()
  const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/dashboard')

  const { data: membershipContextRows } = await supabase
    .from('profile_business_memberships')
    .select('user_id, business_profile_id')
    .or(`user_id.eq.${id},business_profile_id.eq.${id}`)

  const ownerUserId =
    membershipContextRows?.find((row) => row.user_id !== row.business_profile_id && row.business_profile_id === id)?.user_id ??
    membershipContextRows?.find((row) => row.user_id === id)?.user_id ??
    id

  const { data: businessMemberships } = await supabase
    .from('profile_business_memberships')
    .select(`
      user_id,
      business_profile_id,
      role,
      status,
      is_default,
      business_profile:profiles!profile_business_memberships_business_profile_id_fkey(
        id,
        full_name,
        business_name,
        entity_type,
        industry,
        assigned_program,
        subscription_status,
        account_state,
        portal_blocked,
        created_at
      )
    `)
    .eq('user_id', ownerUserId)
    .eq('status', 'active')

  const [
    { data: profile },
    { data: subscription },
    { data: tasks },
    { data: documents },
    { data: activityLogs },
    { data: contactNotes },
    { data: tickets },
    { data: memberships },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('subscriptions').select('*').eq('user_id', id).single(),
    supabase.from('tasks').select('*').eq('user_id', id).order('sort_order'),
    supabase.from('documents').select('*').eq('user_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('activity_logs').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(25),
    supabase.from('contact_notes').select('*').eq('user_id', id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('tickets').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('memberships').select('program_code').eq('user_id', id).eq('status', 'active'),
  ])

  // Attach active_programs to profile so MemberDetail can initialize checkbox state
  const activePrograms = (memberships ?? []).map((m: { program_code: string }) => m.program_code)

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Member not found.</p>
          <Link href="/admin/members" className="text-green-600 hover:underline text-sm">← Back to Members</Link>
        </div>
      </div>
    )
  }

  const linkedBusinesses = (businessMemberships ?? []).flatMap((membership) => {
    const business = Array.isArray(membership.business_profile)
      ? membership.business_profile[0]
      : membership.business_profile
    if (!business) return []

    const record = business as ManagedBusinessRecord
    return [{
      id: record.id,
      label: record.business_name?.trim() || record.full_name?.trim() || 'Business Account',
      entity_type: record.entity_type?.trim() || null,
      industry: record.industry?.trim() || null,
      role: membership.role as string,
      is_default: Boolean(membership.is_default),
      account_state: record.account_state ?? 'prospect',
      subscription_status: record.subscription_status ?? 'inactive',
      assigned_program: record.assigned_program,
      portal_blocked: Boolean(record.portal_blocked),
      created_at: record.created_at,
      is_current: record.id === id,
      business_status: (
        (record.subscription_status === 'active' || record.subscription_status === 'trialing')
          ? 'active'
          : record.account_state === 'active_member'
            ? 'inactive'
            : 'pending'
      ) as 'active' | 'inactive' | 'pending',
    }]
  })

  return (
    <MemberDetail
      profile={{ ...normalizeMemberProfile(profile), active_programs: activePrograms }}
      subscription={subscription ?? null}
      tasks={tasks ?? []}
      documents={documents ?? []}
      activityLogs={activityLogs ?? []}
      contactNotes={contactNotes ?? []}
      tickets={tickets ?? []}
      linkedBusinesses={linkedBusinesses}
    />
  )
}
