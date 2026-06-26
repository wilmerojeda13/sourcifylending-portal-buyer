'use client'

import Link from 'next/link'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Lock,
  CalendarDays,
  Sparkles,
  ArrowRight,
  Bot,
  FileText,
  CheckSquare,
  TrendingUp,
  ChevronRight,
  Target,
  BadgeDollarSign,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import AnalyzerResultClaimer from '@/components/auth/AnalyzerResultClaimer'
import type { UserProfile } from '@/types'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

const READINESS_ICON: Record<string, React.ReactNode> = {
  Ready: <CheckCircle size={20} className="text-green-600" />,
  'Conditionally Ready': <AlertTriangle size={20} className="text-yellow-600" />,
  'Not Ready': <XCircle size={20} className="text-red-500" />,
}

const READINESS_BG: Record<string, string> = {
  Ready: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  'Conditionally Ready': 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  'Not Ready': 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
}

interface ProspectDashboardProps {
  profile: UserProfile
}

export default function ProspectDashboard({ profile }: ProspectDashboardProps) {
  const bookingUrl = 'https://calendar.app.google/PGkzpGXXjRHkLHTEA'
  const { locale } = useLanguage()
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  const result = profile.latest_analyzer_result
  const readiness = profile.readiness_status
  const program = profile.assigned_program

  const programInfo = program
    ? {
        short:
          program === 'program_a'
            ? text('dashboard.programAShort', 'Program A')
            : program === 'program_b'
              ? text('dashboard.programBShort', 'Program B')
              : text('dashboard.programCShort', 'Program C'),
        full:
          program === 'program_a'
            ? text('dashboard.programAFull', '0% Intro APR Card Strategy')
            : program === 'program_b'
              ? text('dashboard.programBFull', 'Business Credit Builder')
              : text('dashboard.programCFull', 'Capital Monitoring Membership'),
        description:
          program === 'program_a'
            ? text(
                'dashboard.programADescription',
                'Access multiple 0% intro APR business cards to fund your business with no-interest capital. Requires strong personal credit profile.'
              )
            : program === 'program_b'
              ? text(
                  'dashboard.programBDescription',
                  'Build a strong business credit profile under your EIN with tier-1 vendors and reporting tradelines.'
                )
              : text(
                  'dashboard.programCDescription',
                  'Monthly credit monitoring, reporting cleanup, and readiness coaching to get you qualified for funding.'
                ),
      }
    : null

  const readinessBg = readiness
    ? READINESS_BG[readiness] ?? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
  const readinessIcon = readiness ? READINESS_ICON[readiness] ?? null : null

  const firstName = (profile.full_name || '').split(' ')[0] || 'there'

  return (
    <div className="space-y-5">
      {!result && <AnalyzerResultClaimer />}

      <div>
        <h1 className="page-title">
          {text('dashboard.welcomeBack', 'Welcome back')}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {text('dashboard.personalizedAnalysis', "Here's your personalized credit readiness analysis.")}
          {program && (
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {' '}
              {text('dashboard.recommended', 'Recommended')}: {programInfo?.short}.
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-green-600 to-green-700 p-5 text-white sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles size={16} className="text-green-200" />
            <span className="text-xs font-bold uppercase tracking-wide text-green-200">
              {text('dashboard.freeMemberAccount', 'Free Member Account')}
            </span>
          </div>
          <p className="text-lg font-bold">{text('dashboard.unlockFullAccess', 'Unlock Full Program Access')}</p>
          <p className="mt-0.5 text-sm text-green-200">
            {text('dashboard.getRoadmap', 'Get your task roadmap, AI fulfillment agent, document manager, and dedicated advisor.')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href={`/billing${program ? `?program=${program}` : ''}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-green-700 transition-colors hover:bg-green-50"
          >
            {text('dashboard.startProgram', 'Start My Program')} <ArrowRight size={14} />
          </Link>
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-green-400/40 bg-green-500/30 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500/50"
            >
              <CalendarDays size={14} /> {text('dashboard.bookCalendar', 'Book on Google Calendar')}
            </a>
          )}
        </div>
      </div>

      <div className="card border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-green-500">
              {text('dashboard.freeInquiryDisputeTool', 'Free Inquiry Dispute Tool')}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {text('dashboard.generateLetter', 'Generate a hard inquiry dispute letter and track it inside your portal.')}
            </p>
          </div>
          <Link
            href="/credit-disputes"
            className="inline-flex items-center justify-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
          >
            {text('dashboard.openDisputes', 'Open Inquiry Disputes')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`card border-2 ${readinessBg}`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {text('dashboard.yourFundingReadiness', 'Your Funding Readiness')}
          </p>
          {readiness ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                {readinessIcon}
                <span className="text-xl font-bold text-gray-900 dark:text-white">{readiness}</span>
              </div>
              {typeof result?.readiness_score === 'number' && (
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                  <Target size={14} className="text-green-600" />
                  {text('dashboard.score', 'Score')}: {result.readiness_score}/100
                </div>
              )}
              <StatusBadge status={readiness} />
              {result?.summary && (
                <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{result.summary}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {text('dashboard.noAnalysis', 'No analysis on file.')}{' '}
              <Link href="/analyzer" className="font-medium text-green-600">
                {text('dashboard.runAnalyzer', 'Run the analyzer')}
              </Link>
            </p>
          )}
        </div>

        <div className="card border-2 border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-900/20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-400">
            {text('dashboard.recommendedProgram', 'Recommended Program')}
          </p>
          {programInfo ? (
            <>
              <p className="mb-1 text-base font-bold text-green-900 dark:text-green-300">
                {programInfo.short} - {programInfo.full}
              </p>
              <p className="text-sm leading-relaxed text-green-700 dark:text-green-400">{programInfo.description}</p>
              {result?.recommendation && (
                <p className="mt-3 text-xs italic leading-relaxed text-green-600 dark:text-green-400">
                  &ldquo;{result.recommendation}&rdquo;
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{text('portal.noProgram', 'No Program')}</p>
          )}
        </div>
      </div>

      {result?.estimated_funding_range && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-green-500">
              <BadgeDollarSign size={14} />
              {text('dashboard.estimatedFundingRange', 'Estimated Funding Range')}
            </p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-300">{result.estimated_funding_range}</p>
            {result.recommended_next_step && (
              <p className="mt-3 text-sm leading-relaxed text-green-700 dark:text-green-400">{result.recommended_next_step}</p>
            )}
          </div>

          <div className="card">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {text('dashboard.topBlockers', 'Top 3 Funding Blockers')}
            </p>
            <ul className="space-y-2">
              {(result.top_blockers ?? []).slice(0, 3).map((blocker, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result?.risk_flags && result.risk_flags.length > 0 && (
        <div className="card">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <AlertTriangle size={16} className="text-yellow-500" />
            {text('dashboard.riskFactors', 'Risk Factors to Address')} ({result.risk_flags.length})
          </h2>
          <ul className="space-y-2">
            {result.risk_flags.map((flag, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                {flag}
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {text('dashboard.riskFactorsHelp', 'These factors are addressed step-by-step inside your program roadmap.')}{' '}
              <Link href={`/billing${program ? `?program=${program}` : ''}`} className="font-semibold text-green-600">
                {text('dashboard.upgradeToBegin', 'Upgrade to begin')}
              </Link>
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Lock size={16} className="text-gray-400" />
          {text('dashboard.premiumFeatures', 'Premium Features - Unlock with a Membership')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px] dark:bg-gray-800/70">
              <div className="px-4 text-center">
                <Lock size={20} className="mx-auto mb-1.5 text-gray-400" />
                <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  {text('dashboard.upgradeToUnlock', 'Upgrade to Unlock')}
                </p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  {text('dashboard.startProgramCta', 'Start Program')} <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="pointer-events-none select-none opacity-30">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <CheckSquare size={14} /> {text('dashboard.taskRoadmap', 'Task Roadmap')}
              </p>
              <div className="space-y-2">
                {[
                  'Set up business bank account',
                  'Apply for D-U-N-S number',
                  'Open Net-30 vendor accounts',
                ].map((task) => (
                  <div key={task} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700">
                    <div className="h-3 w-3 shrink-0 rounded-full border-2 border-gray-300" />
                    <span className="truncate text-xs text-gray-500">{task}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px] dark:bg-gray-800/70">
              <div className="px-4 text-center">
                <Lock size={20} className="mx-auto mb-1.5 text-gray-400" />
                <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  {text('dashboard.upgradeToUnlock', 'Upgrade to Unlock')}
                </p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  {text('dashboard.startProgramCta', 'Start Program')} <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="pointer-events-none select-none opacity-30">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Bot size={14} /> {text('dashboard.aiFulfillmentAgent', 'AI Fulfillment Agent')}
              </p>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-xs italic text-gray-500">
                  &ldquo;{text('dashboard.aiTeaserQuestion', "What's my next step for building business credit?")}&rdquo;
                </p>
                <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/30">
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {text('dashboard.aiTeaserAnswer', 'Based on your profile, your next step is to open a Net-30 account with Uline...')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px] dark:bg-gray-800/70">
              <div className="px-4 text-center">
                <Lock size={20} className="mx-auto mb-1.5 text-gray-400" />
                <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  {text('dashboard.upgradeToUnlock', 'Upgrade to Unlock')}
                </p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  {text('dashboard.startProgramCta', 'Start Program')} <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="pointer-events-none select-none opacity-30">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <FileText size={14} /> {text('dashboard.documentManager', 'Document Manager')}
              </p>
              <div className="space-y-2">
                {['Personal Credit Report', 'EIN Letter', 'Business Formation Docs'].map((document) => (
                  <div key={document} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700">
                    <FileText size={12} className="shrink-0 text-gray-300" />
                    <span className="truncate text-xs text-gray-500">{document}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border border-gray-200 py-8 text-center dark:border-gray-700">
        <TrendingUp size={28} className="mx-auto mb-3 text-green-500" />
        <h3 className="mb-1 text-lg font-bold text-gray-900 dark:text-white">
          {text('dashboard.readyToExecute', 'Ready to Execute')} {programInfo?.short ?? text('dashboard.yourProgram', 'Your Program')}?
        </h3>
        <p className="mx-auto mb-5 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          {text('dashboard.getFullAccess', 'Get full access to your roadmap, advisor of AI, upload manager, and status tracking.')}
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/billing${program ? `?program=${program}` : ''}`} className="btn-primary px-8 py-3.5 text-base">
            {text('dashboard.startProgram', 'Start My Program')} <ArrowRight size={16} />
          </Link>
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center justify-center gap-2 px-8 py-3.5 text-base"
            >
              <CalendarDays size={16} /> {text('dashboard.bookCallFirst', 'Book a Call First')}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
