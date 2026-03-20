export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

import PortalLayout from '@/components/layout/PortalLayout'
import ProspectDashboard from '@/app/dashboard/ProspectDashboard'
import GenerateRoadmapButton from '@/components/dashboard/GenerateRoadmapButton'
import UnderwritingGateBanner from '@/components/dashboard/UnderwritingGateBanner'
import { getProgramShortLabel, getReadinessColor, formatDate } from '@/lib/utils'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatusBadge } from '@/components/ui/Badge'
import Link from 'next/link'
import type { UserProfile } from '@/types'
import {
  ArrowRight, CheckCircle, Clock, AlertCircle, Bot,
  TrendingUp, FileText, Bell, Lock, DollarSign
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const user = session.user

  // Always fetch profile first — we need account_state to decide the render path
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // ── Prospect path ─────────────────────────────────────────────────────────
  if (profile?.account_state === 'prospect') {
    return (
      <PortalLayout
        userName={profile.full_name || user.email || 'Client'}
        programLabel="Free Prospect Account"
        notificationCount={0}
        assignedProgram={profile.assigned_program}
        portalBlocked={profile.portal_blocked}
        isDemo={profile.is_demo}
        isAdmin={profile.is_admin}
        accountState="prospect"
      >
        <ProspectDashboard profile={profile as UserProfile} />
      </PortalLayout>
    )
  }

  // ── Underwriting gate — block roadmap/opportunities until reviewed (monthly) ─
  const uwNextDue = profile?.underwriting_next_due_at
  const needsUnderwriting =
    profile?.account_state === 'active_member' &&
    (profile?.assigned_program === 'program_a' || profile?.assigned_program === 'program_b') &&
    (!uwNextDue || new Date(uwNextDue) < new Date())

  if (needsUnderwriting) {
    const { data: uwNotifs } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('read', false)
    return (
      <PortalLayout
        userName={profile?.full_name || user.email || 'Client'}
        programLabel={getProgramShortLabel(profile?.assigned_program)}
        notificationCount={uwNotifs?.length || 0}
        assignedProgram={profile?.assigned_program}
        portalBlocked={profile?.portal_blocked}
        isDemo={profile?.is_demo}
        isAdmin={profile?.is_admin}
        accountState="active_member"
        demoSecondaryProgram={profile?.demo_secondary_program ?? null}
      >
        <UnderwritingGateBanner
          program={profile?.assigned_program ?? 'program_b'}
          reviewCount={profile?.underwriting_review_count ?? 0}
          nextDueAt={uwNextDue ?? null}
        />
      </PortalLayout>
    )
  }

  // ── Member path — fetch member-specific data ───────────────────────────────
  const [
    { data: tasks },
    { data: docs },
    { data: reports },
    { data: notifications },
    { data: fundingApprovals },
  ] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('documents').select('*').eq('user_id', user.id),
    supabase.from('reports').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(3),
    supabase.from('notifications').select('*').eq('user_id', user.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
    supabase.from('funding_approvals').select('approved_amount,approved_limit,approval_type,issuer_name,approval_date').eq('user_id', user.id).eq('status', 'Approved'),
  ])

  const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'

  // ── Underwriting countdown — only for programs A & B with a current review ─
  const showUWCountdown =
    (profile?.assigned_program === 'program_a' || profile?.assigned_program === 'program_b') &&
    !!profile?.underwriting_next_due_at
  const uwDaysUntilDue = showUWCountdown
    ? Math.ceil((new Date(profile!.underwriting_next_due_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const uwCountdownUrgent = uwDaysUntilDue !== null && uwDaysUntilDue <= 7

  const CREDIT_ACCOUNT_TYPES = ['0% APR Card', 'Business Credit Card', 'Vendor Account', 'Store Account', 'Fleet Account', 'Line of Credit']
  const totalFundingApproved = (fundingApprovals ?? []).reduce((sum, a) => {
    const isCreditAccount = CREDIT_ACCOUNT_TYPES.includes(a.approval_type)
    const amt = isCreditAccount ? (a.approved_limit ?? a.approved_amount ?? 0) : (a.approved_amount ?? a.approved_limit ?? 0)
    return sum + Number(amt)
  }, 0)
  const mostRecentApproval = fundingApprovals?.[0] ?? null

  const completedTasks = tasks?.filter((t) => t.status === 'completed') || []
  const pendingTasks = tasks?.filter((t) => t.status === 'pending') || []
  const nextTask = pendingTasks[0] || null
  const totalTasks = tasks?.length || 0
  const progress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      notificationCount={notifications?.length || 0}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      accountState="active_member"
      uwNextDueAt={profile?.underwriting_next_due_at ?? null}
      demoSecondaryProgram={profile?.demo_secondary_program ?? null}
    >
      {/* Subscription Locked Banner */}
      {!isActive && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Lock size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">Membership Inactive</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Your roadmap progress is paused. Reactivate your subscription to continue from your current stage.
            </p>
          </div>
          <Link href="/billing" className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors">
            Reactivate
          </Link>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="page-title">
          Welcome back, {(profile?.full_name || user.email || '').split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {profile?.business_name ? `${profile.business_name} · ` : ''}
          {profile?.assigned_program ? getProgramShortLabel(profile.assigned_program) : 'No program assigned yet'}
        </p>
      </div>

      {/* Funding Results Hero — only show if approvals exist */}
      {totalFundingApproved > 0 && (
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl px-5 py-4 mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-green-200">Total Approved Funding So Far</p>
            <p className="text-3xl font-bold text-white">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalFundingApproved)}
            </p>
            {mostRecentApproval && (
              <p className="text-xs text-green-200 mt-0.5">
                Latest: {mostRecentApproval.issuer_name} · {mostRecentApproval.approval_date}
              </p>
            )}
          </div>
          <Link href="/funding-results" className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors">
            <DollarSign size={14} /> View All
          </Link>
        </div>
      )}

      {/* Underwriting Renewal Countdown */}
      {showUWCountdown && uwDaysUntilDue !== null && (
        <div className={`rounded-2xl px-4 py-3 mb-5 flex items-center justify-between gap-3 border ${
          uwCountdownUrgent
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center gap-3">
            <TrendingUp size={18} className={uwCountdownUrgent ? 'text-amber-600 shrink-0' : 'text-green-600 shrink-0'} />
            <div>
              <p className={`text-sm font-semibold ${uwCountdownUrgent ? 'text-amber-800' : 'text-green-800'}`}>
                {uwDaysUntilDue > 0
                  ? `Monthly review due in ${uwDaysUntilDue} day${uwDaysUntilDue !== 1 ? 's' : ''}`
                  : 'Monthly review due today'}
              </p>
              <p className={`text-xs mt-0.5 ${uwCountdownUrgent ? 'text-amber-600' : 'text-green-600'}`}>
                Review #{(profile?.underwriting_review_count ?? 0) + 1} · Re-underwriting keeps your roadmap current
              </p>
            </div>
          </div>
          {uwCountdownUrgent && (
            <Link
              href="/underwriting"
              className="shrink-0 text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Start Now
            </Link>
          )}
        </div>
      )}

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Readiness — hide entirely for active members who never ran the analyzer */}
        {(profile?.readiness_status || !isActive) && (
          <div className="card col-span-2 md:col-span-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Funding Readiness</p>
            {profile?.readiness_status ? (
              <StatusBadge status={profile.readiness_status} />
            ) : (
              <Link href="/analyzer" className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                Run analyzer <ArrowRight size={12} />
              </Link>
            )}
          </div>
        )}

        {/* Program */}
        <div className="card col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigned Program</p>
          <p className="font-bold text-gray-900 text-sm leading-snug">
            {profile?.assigned_program ? getProgramShortLabel(profile.assigned_program) : 'Not assigned'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {profile?.current_stage ? `Stage: ${profile.current_stage}` : 'No stage yet'}
          </p>
        </div>

        {/* Progress */}
        <div className="card col-span-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Overall Progress</p>
            <span className="text-lg font-bold text-green-600">{progress}%</span>
          </div>
          <ProgressBar value={progress} size="md" showLabel={false} />
          <p className="text-xs text-gray-400 mt-2">{completedTasks.length} of {totalTasks} tasks completed</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Next Task — large card */}
        <div className="lg:col-span-2">
          <div className="card h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2">
                <Clock size={18} className="text-green-500" />
                Next Required Task
              </h2>
              <Link href="/progress" className="text-xs text-green-600 font-medium flex items-center gap-1 hover:text-green-700">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {!isActive ? (
              <div className="bg-gray-50 rounded-xl p-5 text-center">
                <Lock size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Reactivate subscription to access tasks</p>
              </div>
            ) : nextTask ? (
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle size={16} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-green-900 text-sm">{nextTask.title}</p>
                      <StatusBadge status={nextTask.status} />
                    </div>
                    <p className="text-xs text-green-600 mt-0.5 mb-3">{nextTask.stage}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{nextTask.description}</p>
                    {nextTask.due_date && (
                      <p className="text-xs text-gray-400 mt-2">Due: {formatDate(nextTask.due_date)}</p>
                    )}
                    {nextTask.requires_document && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg w-fit">
                        <FileText size={12} />
                        Document upload required
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/progress?taskId=${encodeURIComponent(nextTask.task_id)}`}
                    className="btn-primary text-xs px-4 py-2.5"
                  >
                    Go to Task
                  </Link>
                  <Link href="/agent" className="btn-secondary text-xs px-4 py-2.5">
                    Ask AI Agent
                  </Link>
                </div>
              </div>
            ) : totalTasks === 0 ? (
              <div className="bg-gray-50 rounded-xl p-5">
                {isActive ? (
                  <GenerateRoadmapButton />
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-3">No tasks assigned yet.</p>
                    <Link href="/billing" className="btn-primary text-xs">Subscribe to Begin</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-5 text-center">
                <CheckCircle size={28} className="text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-800 text-sm">All tasks complete!</p>
                <p className="text-xs text-green-600 mt-1">Great work. Check reports for your next steps.</p>
              </div>
            )}
          </div>
        </div>

        {/* Notifications + Subscription Status */}
        <div className="space-y-4">
          {/* Subscription */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Subscription</p>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={profile?.subscription_status || 'inactive'} />
            </div>
            <p className="text-xs text-gray-400">
              {profile?.subscription_status === 'active'
                ? 'Full access active'
                : profile?.subscription_status === 'trialing'
                ? 'Trial period active'
                : 'Limited access'}
            </p>
            {!isActive && (
              <Link href="/billing" className="mt-3 btn-primary text-xs w-full py-2.5">
                {profile?.subscription_status === 'canceled' ? 'Reactivate' : 'Subscribe Now'}
              </Link>
            )}
          </div>

          {/* Notifications */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Bell size={14} />
                Notifications
              </p>
              {(notifications?.length || 0) > 0 && (
                <span className="text-xs font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">
                  {notifications?.length}
                </span>
              )}
            </div>
            {notifications && notifications.length > 0 ? (
              <ul className="space-y-2">
                {notifications.slice(0, 3).map((n) => (
                  <li key={n.id} className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                    <p className="font-semibold text-gray-700">{n.title}</p>
                    <p className="text-gray-500 mt-0.5">{n.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">No new notifications</p>
            )}
          </div>
        </div>
      </div>

      {/* AI Agent Quick Access */}
      <div className="card bg-gradient-to-br from-green-600 to-green-800 border-0 text-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
            <Bot size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white">AI Fulfillment Agent</h3>
            <p className="text-green-200 text-sm mt-0.5">
              Ask anything about your program, next steps, missing documents, or readiness status.
            </p>
          </div>
          <Link
            href="/agent"
            className={`shrink-0 bg-white text-green-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-green-50 transition-colors flex items-center gap-1.5 ${!isActive ? 'opacity-60 pointer-events-none' : ''}`}
          >
            Open Agent <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Recent Reports */}
      {reports && reports.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <TrendingUp size={18} className="text-green-500" />
              Recent Reports
            </h2>
            <Link href="/reports" className="text-xs text-green-600 font-medium flex items-center gap-1 hover:text-green-700">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {reports.map((r) => (
              <Link key={r.report_id} href="/reports" className="card-hover block">
                <p className="text-xs font-semibold text-green-500 mb-1 uppercase tracking-wide">
                  {r.report_type?.replace(/_/g, ' ')}
                </p>
                <p className="text-sm font-bold text-gray-900 mb-1">{r.title}</p>
                <p className="text-xs text-gray-400">{formatDate(r.generated_at)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Documents Summary */}
      {docs && docs.length > 0 && (
        <div className="mt-5 card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <FileText size={18} className="text-green-500" />
              Document Status
            </h2>
            <Link href="/documents" className="text-xs text-green-600 font-medium flex items-center gap-1">
              Manage <ArrowRight size={12} />
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{docs.length}</p>
              <p className="text-xs text-gray-400">Uploaded</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{docs.filter((d) => d.review_status === 'approved').length}</p>
              <p className="text-xs text-gray-400">Approved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{docs.filter((d) => d.review_status === 'pending').length}</p>
              <p className="text-xs text-gray-400">Pending Review</p>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}
