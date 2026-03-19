'use client'
import Link from 'next/link'
import {
  CheckCircle, AlertTriangle, XCircle, Lock,
  CalendarDays, Sparkles, ArrowRight, Bot,
  FileText, CheckSquare, TrendingUp, ChevronRight,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import AnalyzerResultClaimer from '@/components/auth/AnalyzerResultClaimer'
import type { UserProfile } from '@/types'

const PROGRAM_NAMES: Record<string, { short: string; full: string; description: string }> = {
  program_a: {
    short: 'Program A',
    full: '0% Intro APR Card Strategy',
    description: 'Access multiple 0% intro APR business cards to fund your business with no-interest capital. Requires strong personal credit profile.',
  },
  program_b: {
    short: 'Program B',
    full: 'Business Credit Builder',
    description: 'Build a strong business credit profile under your EIN with tier-1 vendors and reporting tradelines.',
  },
  program_c: {
    short: 'Program C',
    full: 'Capital Monitoring Membership',
    description: 'Monthly credit monitoring, reporting cleanup, and readiness coaching to get you qualified for funding.',
  },
}

const READINESS_ICON: Record<string, React.ReactNode> = {
  'Ready': <CheckCircle size={20} className="text-green-600" />,
  'Conditionally Ready': <AlertTriangle size={20} className="text-yellow-600" />,
  'Not Ready': <XCircle size={20} className="text-red-500" />,
}

const READINESS_BG: Record<string, string> = {
  'Ready': 'bg-green-50 border-green-200',
  'Conditionally Ready': 'bg-yellow-50 border-yellow-200',
  'Not Ready': 'bg-red-50 border-red-200',
}

interface ProspectDashboardProps {
  profile: UserProfile
}

export default function ProspectDashboard({ profile }: ProspectDashboardProps) {
  const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || null

  const result = profile.latest_analyzer_result
  const readiness = profile.readiness_status
  const program = profile.assigned_program

  const programInfo = program ? PROGRAM_NAMES[program] : null
  const readinessBg = readiness ? (READINESS_BG[readiness] ?? 'bg-gray-50 border-gray-200') : 'bg-gray-50 border-gray-200'
  const readinessIcon = readiness ? (READINESS_ICON[readiness] ?? null) : null

  const firstName = (profile.full_name || '').split(' ')[0] || 'there'

  return (
    <div className="space-y-5">

      {/* Claim pending analyzer result from Google OAuth sessionStorage (no-op if already set) */}
      {!result && <AnalyzerResultClaimer />}

      {/* Welcome header */}
      <div>
        <h1 className="page-title">Welcome, {firstName} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">
          Here's your personalized credit readiness analysis.
          {program && <span className="font-medium text-gray-700"> Recommended: {programInfo?.short}.</span>}
        </p>
      </div>

      {/* Upgrade Banner */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-5 text-white flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-green-200" />
            <span className="text-xs font-bold uppercase tracking-wide text-green-200">Free Prospect Account</span>
          </div>
          <p className="font-bold text-lg">Unlock Full Program Access</p>
          <p className="text-green-200 text-sm mt-0.5">
            Get your task roadmap, AI fulfillment agent, document manager, and dedicated advisor.
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link
            href={`/billing${program ? `?program=${program}` : ''}`}
            className="bg-white text-green-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors flex items-center gap-1.5 justify-center"
          >
            Start My Program <ArrowRight size={14} />
          </Link>
          {BOOKING_URL && (
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500/30 border border-green-400/40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-green-500/50 transition-colors flex items-center gap-1.5 justify-center"
            >
              <CalendarDays size={14} /> Book a Strategy Call
            </a>
          )}
        </div>
      </div>

      {/* Analyzer Snapshot grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Readiness Card */}
        <div className={`card border-2 ${readinessBg}`}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your Funding Readiness</p>
          {readiness ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                {readinessIcon}
                <span className="text-xl font-bold text-gray-900">{readiness}</span>
              </div>
              <StatusBadge status={readiness} />
              {result?.summary && (
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">{result.summary}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No analysis on file. <Link href="/analyzer" className="text-green-600 font-medium">Run the analyzer</Link></p>
          )}
        </div>

        {/* Recommended Program */}
        <div className="card border-2 border-green-200 bg-green-50/40">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Recommended Program</p>
          {programInfo ? (
            <>
              <p className="text-base font-bold text-green-900 mb-1">{programInfo.short} — {programInfo.full}</p>
              <p className="text-sm text-green-700 leading-relaxed">{programInfo.description}</p>
              {result?.recommendation && (
                <p className="text-xs text-green-600 mt-3 italic leading-relaxed">&ldquo;{result.recommendation}&rdquo;</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No program assigned yet.</p>
          )}
        </div>
      </div>

      {/* Risk Flags */}
      {result?.risk_flags && result.risk_flags.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-500" />
            Risk Factors to Address ({result.risk_flags.length})
          </h2>
          <ul className="space-y-2">
            {result.risk_flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                {flag}
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              These factors are addressed step-by-step inside your program roadmap.{' '}
              <Link href={`/billing${program ? `?program=${program}` : ''}`} className="text-green-600 font-semibold">
                Upgrade to begin →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Premium Feature Teasers (Locked) */}
      <div>
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Lock size={16} className="text-gray-400" />
          Premium Features — Unlock with a Membership
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Tasks Teaser */}
          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl">
              <div className="text-center px-4">
                <Lock size={20} className="text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-gray-600">Upgrade to Unlock</p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  Start Program <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="opacity-30 pointer-events-none select-none">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckSquare size={14} /> Task Roadmap
              </p>
              <div className="space-y-2">
                {['Set up business bank account', 'Apply for D-U-N-S number', 'Open Net-30 vendor accounts'].map((t) => (
                  <div key={t} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                    <div className="w-3 h-3 rounded-full border-2 border-gray-300 shrink-0" />
                    <span className="text-xs text-gray-500 truncate">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Agent Teaser */}
          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl">
              <div className="text-center px-4">
                <Lock size={20} className="text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-gray-600">Upgrade to Unlock</p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  Start Program <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="opacity-30 pointer-events-none select-none">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bot size={14} /> AI Fulfillment Agent
              </p>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 italic">&ldquo;What's my next step for building business credit?&rdquo;</p>
                <div className="mt-2 bg-green-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-green-700">Based on your profile, your next step is to open a Net-30 account with Uline…</p>
                </div>
              </div>
            </div>
          </div>

          {/* Documents Teaser */}
          <div className="card relative overflow-hidden">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl">
              <div className="text-center px-4">
                <Lock size={20} className="text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-gray-600">Upgrade to Unlock</p>
                <Link
                  href={`/billing${program ? `?program=${program}` : ''}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700"
                >
                  Start Program <ChevronRight size={12} />
                </Link>
              </div>
            </div>
            <div className="opacity-30 pointer-events-none select-none">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText size={14} /> Document Manager
              </p>
              <div className="space-y-2">
                {['Personal Credit Report', 'EIN Letter', 'Business Formation Docs'].map((d) => (
                  <div key={d} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                    <FileText size={12} className="text-gray-300 shrink-0" />
                    <span className="text-xs text-gray-500 truncate">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="card border border-gray-200 text-center py-8">
        <TrendingUp size={28} className="text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          Ready to Execute {programInfo?.short ?? 'Your Program'}?
        </h3>
        <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
          Get full access to your roadmap, AI agent, document manager, and personal advisor guidance.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/billing${program ? `?program=${program}` : ''}`}
            className="btn-primary px-8 py-3.5 text-base"
          >
            Start My Program <ArrowRight size={16} />
          </Link>
          {BOOKING_URL && (
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-8 py-3.5 text-base flex items-center gap-2 justify-center"
            >
              <CalendarDays size={16} /> Book a Call First
            </a>
          )}
        </div>
      </div>

    </div>
  )
}
