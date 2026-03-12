'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle, Circle, AlertCircle, Lock, FileText, Copy, Check,
  TrendingUp, Star, AlertTriangle, Info
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ProfileSummary {
  credit_score_range: string | null
  utilization_range: string | null
  inquiry_range: string | null
  nsf_flag: boolean
  readiness_status: string | null
  business_name: string | null
}

interface Task {
  task_id: string
  title: string
  description: string
  status: string
  stage: string
}

interface Props {
  profile: ProfileSummary
  nextTask: Task | null
  isActive: boolean
}

// ─── Static Optimization Tasks ─────────────────────────────────────────────────
const OPTIMIZATION_TASKS = [
  {
    id: 'pull_reports',
    title: 'Pull Your 3-Bureau Credit Report',
    description:
      'Obtain your full credit reports from all three bureaus (Equifax, Experian, TransUnion) via AnnualCreditReport.com. This is required before reviewing any other metric.',
    priority: 'high',
    link: null,
  },
  {
    id: 'review_utilization',
    title: 'Review & Reduce Credit Utilization',
    description:
      'Calculate your current utilization ratio. Aim for under 10% per card and under 30% overall before applying for new business credit. Pay down balances on the highest-utilization cards first.',
    priority: 'high',
    link: null,
  },
  {
    id: 'address_inquiries',
    title: 'Address Excessive Hard Inquiries',
    description:
      'Hard inquiries older than 1 year still appear but carry less weight. If you have 4+ inquiries in the last 6 months, pause new applications until they age or can be disputed.',
    priority: 'medium',
    link: null,
  },
  {
    id: 'dispute_inaccuracies',
    title: 'Dispute Inaccurate or Unverifiable Items',
    description:
      'Review each tradeline for errors: incorrect balances, wrong account status, duplicate accounts, or items beyond the 7-year reporting window. Use the Dispute Letter generator below.',
    priority: 'high',
    link: '#dispute-letters',
  },
  {
    id: 'open_secured',
    title: 'Open a Secured or Starter Business Card',
    description:
      'If you have no open business credit accounts, open one secured or beginner business card and use it for small monthly expenses. Pay it in full each month to build positive history.',
    priority: 'medium',
    link: '/opportunities',
  },
  {
    id: 'pay_down_balances',
    title: 'Pay Down Revolving Balances',
    description:
      'Make a plan to pay down revolving balances systematically. Focus on the card with the highest utilization ratio first (avalanche method). Even small reductions can improve your score quickly.',
    priority: 'high',
    link: null,
  },
  {
    id: 'limit_increases',
    title: 'Request Credit Limit Increases',
    description:
      'After 6–12 months of on-time payments, request a credit limit increase on your best accounts. Higher limits lower your utilization ratio without requiring additional spending.',
    priority: 'medium',
    link: null,
  },
  {
    id: 'autopay',
    title: 'Set Up Autopay on All Accounts',
    description:
      'A single 30-day late payment can drop your score 60–100 points. Set minimum payment autopay on every open account so you never miss a due date while you work on the bigger tasks.',
    priority: 'high',
    link: null,
  },
]

// ─── Dispute Letter Templates ──────────────────────────────────────────────────
const DISPUTE_TYPES = [
  {
    id: 'personal_info',
    label: 'Incorrect Personal Information',
    fields: [
      { key: 'wrong_info', label: 'What is incorrect? (e.g., wrong address, wrong SSN digit)', type: 'text' as const },
      { key: 'correct_info', label: 'What is the correct information?', type: 'text' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am writing to dispute inaccurate personal information appearing on my credit report.\n\nThe following information is incorrect: ${data.wrong_info || '[incorrect information]'}\n\nThe correct information is: ${data.correct_info || '[correct information]'}\n\nI request that you update my credit file to reflect the accurate information. Please investigate this matter and correct the inaccuracy at your earliest convenience.\n\nEnclosed: [Copy of government-issued ID, proof of correct information]\n\nThank you for your attention to this matter.\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'wrong_balance',
    label: 'Account Inaccuracy (Wrong Balance / Limit)',
    fields: [
      { key: 'creditor', label: 'Creditor / Account Name', type: 'text' as const },
      { key: 'reported_amount', label: 'Inaccurately Reported Amount', type: 'text' as const },
      { key: 'correct_amount', label: 'Correct Amount', type: 'text' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am disputing an inaccuracy on my credit report regarding the following account:\n\nCreditor: ${data.creditor || '[Creditor Name]'}\n\nThe account is currently reporting a balance/limit of ${data.reported_amount || '[reported amount]'}. This is inaccurate. The correct amount is ${data.correct_amount || '[correct amount]'}.\n\nUnder the Fair Credit Reporting Act (FCRA), I request that you investigate this dispute and correct the inaccuracy.\n\nEnclosed: [Account statement or documentation showing correct amount]\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'duplicate',
    label: 'Duplicate Account',
    fields: [
      { key: 'creditor', label: 'Creditor / Account Name', type: 'text' as const },
      { key: 'account_number', label: 'Account Number (last 4 digits only)', type: 'text' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am writing to dispute a duplicate account appearing on my credit report.\n\nThe account in question:\nCreditor: ${data.creditor || '[Creditor Name]'}\nAccount ending in: ${data.account_number || '[XXXX]'}\n\nThis account appears more than once on my credit report. I request that all duplicate entries be removed, retaining only the single, accurate tradeline.\n\nPlease investigate and update my file accordingly.\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'late_payment',
    label: 'Late Payment Dispute',
    fields: [
      { key: 'creditor', label: 'Creditor / Account Name', type: 'text' as const },
      { key: 'reported_date', label: 'Date of Late Payment as Reported', type: 'text' as const },
      { key: 'reason', label: 'Reason for Dispute (e.g., payment was made on time, creditor error)', type: 'textarea' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am disputing a late payment entry on my credit report:\n\nCreditor: ${data.creditor || '[Creditor Name]'}\nReported Late Payment Date: ${data.reported_date || '[date]'}\n\nReason for dispute: ${data.reason || '[Your explanation]'}\n\nUnder the FCRA, I request that you investigate this entry. If the creditor cannot verify that this payment was indeed late, I request that it be updated to reflect on-time status or removed entirely.\n\nEnclosed: [Bank statement, payment confirmation, or other documentation]\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'collection',
    label: 'Collection Account Dispute',
    fields: [
      { key: 'collector', label: 'Collection Agency Name', type: 'text' as const },
      { key: 'original_creditor', label: 'Original Creditor', type: 'text' as const },
      { key: 'basis', label: 'Basis for Dispute (e.g., debt not mine, already paid, beyond SOL)', type: 'textarea' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am disputing a collection account appearing on my credit report:\n\nCollection Agency: ${data.collector || '[Agency Name]'}\nOriginal Creditor: ${data.original_creditor || '[Original Creditor]'}\n\nBasis for this dispute: ${data.basis || '[Your basis]'}\n\nUnder the FCRA and the Fair Debt Collection Practices Act (FDCPA), I request full verification of this debt or its removal from my credit file. If you cannot verify this collection with the original creditor, it must be deleted.\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'inquiry_removal',
    label: 'Inquiry Removal Request',
    fields: [
      { key: 'company', label: 'Company That Pulled Your Credit', type: 'text' as const },
      { key: 'pull_date', label: 'Date of Inquiry', type: 'text' as const },
      { key: 'reason', label: 'Reason (e.g., did not authorize this pull, unauthorized inquiry)', type: 'text' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am writing to dispute an unauthorized hard inquiry on my credit report:\n\nCompany: ${data.company || '[Company Name]'}\nDate of Inquiry: ${data.pull_date || '[date]'}\n\nReason: ${data.reason || 'I did not authorize this company to pull my credit report.'}\n\nI request that this inquiry be removed from my credit file immediately. Under the FCRA, only authorized inquiries may appear on a consumer's credit report.\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
  {
    id: 'identity_theft',
    label: 'Identity Theft / Fraudulent Account',
    fields: [
      { key: 'creditor', label: 'Creditor / Account Name', type: 'text' as const },
      { key: 'account_number', label: 'Account Number (if known, last 4 only)', type: 'text' as const },
    ],
    template: (data: Record<string, string>, bureau: string) =>
      `To Whom It May Concern at ${bureau},\n\nI am writing to report a fraudulent account on my credit report that I did not open:\n\nCreditor: ${data.creditor || '[Creditor Name]'}\nAccount ending in: ${data.account_number || '[XXXX]'}\n\nI am a victim of identity theft and did not open, authorize, or benefit from this account. I request that this account be immediately blocked and removed from my credit file under Section 605B of the FCRA.\n\nEnclosed: [Copy of FTC Identity Theft Report or police report, copy of ID, proof of address]\n\nSincerely,\n[Your Full Name]\n[Your Address]\n[Date]`,
  },
]

const BUREAUS = ['Equifax', 'Experian', 'TransUnion']

const PRIORITY_COLORS = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
}

// ─── Readiness cards derived from profile ──────────────────────────────────────
function getReadinessCards(profile: ProfileSummary, nextTask: Task | null) {
  const scoreRanges: Record<string, { label: string; color: string; note: string }> = {
    '300-579': { label: 'Poor', color: 'text-red-600', note: 'Needs significant improvement before card applications' },
    '580-619': { label: 'Fair', color: 'text-orange-600', note: 'Work on inquiries and utilization first' },
    '620-659': { label: 'Below Average', color: 'text-amber-600', note: 'Secured cards are a good starting point' },
    '660-699': { label: 'Good', color: 'text-yellow-600', note: 'Starter business cards are accessible' },
    '700-749': { label: 'Very Good', color: 'text-green-600', note: 'Most starter business cards are within reach' },
    '750+': { label: 'Excellent', color: 'text-emerald-600', note: 'Prime card offers and higher limits available' },
  }

  const utilizationRanges: Record<string, { label: string; color: string }> = {
    '0-9%': { label: 'Excellent', color: 'text-emerald-600' },
    '10-29%': { label: 'Good', color: 'text-green-600' },
    '30-49%': { label: 'Fair', color: 'text-amber-600' },
    '50-74%': { label: 'High', color: 'text-orange-600' },
    '75%+': { label: 'Very High', color: 'text-red-600' },
  }

  const inquiryRanges: Record<string, { label: string; color: string }> = {
    '0': { label: '0 inquiries', color: 'text-emerald-600' },
    '1-2': { label: '1–2 inquiries', color: 'text-green-600' },
    '3-4': { label: '3–4 inquiries', color: 'text-amber-600' },
    '5+': { label: '5+ inquiries', color: 'text-red-600' },
  }

  const scoreInfo = profile.credit_score_range
    ? scoreRanges[profile.credit_score_range]
    : null

  const utilInfo = profile.utilization_range
    ? utilizationRanges[profile.utilization_range]
    : null

  const inquiryInfo = profile.inquiry_range
    ? inquiryRanges[profile.inquiry_range]
    : null

  const readinessColors: Record<string, string> = {
    'Ready': 'text-green-600',
    'Conditionally Ready': 'text-amber-600',
    'Not Ready': 'text-red-600',
  }

  return [
    {
      label: 'Score Range',
      value: profile.credit_score_range ?? '—',
      sub: scoreInfo?.label ?? (profile.credit_score_range ? '' : 'Run analyzer'),
      color: scoreInfo?.color ?? 'text-gray-400',
      note: scoreInfo?.note ?? null,
    },
    {
      label: 'Utilization',
      value: profile.utilization_range ?? '—',
      sub: utilInfo?.label ?? (profile.utilization_range ? '' : 'Run analyzer'),
      color: utilInfo?.color ?? 'text-gray-400',
      note: !utilInfo ? null : utilInfo.label === 'Excellent' || utilInfo.label === 'Good'
        ? 'On track for card applications'
        : 'Pay down balances to improve',
    },
    {
      label: 'Inquiries (90 days)',
      value: profile.inquiry_range ?? '—',
      sub: inquiryInfo?.label ?? (profile.inquiry_range ? '' : 'Run analyzer'),
      color: inquiryInfo?.color ?? 'text-gray-400',
      note: !inquiryInfo ? null : (profile.inquiry_range === '5+' ? 'Pause new applications' : null),
    },
    {
      label: 'Late / NSF Flag',
      value: profile.nsf_flag ? 'Flagged' : 'Clear',
      sub: profile.nsf_flag ? 'Recent NSF or derogatory event' : 'No recent flags',
      color: profile.nsf_flag ? 'text-red-600' : 'text-emerald-600',
      note: profile.nsf_flag ? 'Address this before applying for new credit' : null,
    },
    {
      label: 'Readiness Status',
      value: profile.readiness_status ?? '—',
      sub: profile.readiness_status ? 'Based on analyzer' : 'Run analyzer to check',
      color: profile.readiness_status ? (readinessColors[profile.readiness_status] ?? 'text-gray-600') : 'text-gray-400',
      note: null,
    },
    {
      label: 'Credit Age',
      value: '—',
      sub: 'Not tracked in portal',
      color: 'text-gray-400',
      note: 'Check your credit report directly',
    },
    {
      label: 'Total Accounts',
      value: '—',
      sub: 'Not tracked in portal',
      color: 'text-gray-400',
      note: 'Check your credit report directly',
    },
    {
      label: 'Main Risk Factor',
      value: profile.nsf_flag
        ? 'NSF / Late'
        : profile.inquiry_range === '5+'
          ? 'High Inquiries'
          : profile.utilization_range && ['50-74%', '75%+'].includes(profile.utilization_range)
            ? 'High Utilization'
            : profile.readiness_status === 'Not Ready'
              ? 'Multiple Factors'
              : profile.credit_score_range && ['300-579', '580-619'].includes(profile.credit_score_range)
                ? 'Low Credit Score'
                : 'None Identified',
      sub: '',
      color: profile.readiness_status === 'Ready' ? 'text-emerald-600' : 'text-amber-700',
      note: null,
    },
    {
      label: 'Next Step',
      value: nextTask?.title ?? 'All clear',
      sub: nextTask?.stage ?? (nextTask ? '' : 'Check Progress tab'),
      color: nextTask ? 'text-green-700' : 'text-gray-400',
      note: null,
    },
  ]
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function CreditOptimizationClient({ profile, nextTask, isActive }: Props) {
  const [activeTab, setActiveTab] = useState<'readiness' | 'tasks' | 'disputes'>('readiness')

  const readinessCards = getReadinessCards(profile, nextTask)

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'readiness', label: 'Credit Readiness' },
          { id: 'tasks', label: 'Optimization Tasks' },
          { id: 'disputes', label: 'Dispute Letters' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Credit Readiness */}
      {activeTab === 'readiness' && (
        <div id="credit-readiness">
          {!profile.credit_score_range && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Run the analyzer to populate these metrics</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Your credit data will appear here after completing the funding readiness analyzer.
                </p>
                <Link href="/analyzer" className="mt-2 inline-block text-xs font-bold text-blue-700 underline underline-offset-2">
                  Go to Analyzer →
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {readinessCards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{card.label}</p>
                <p className={`text-lg font-bold leading-snug ${card.color}`}>{card.value}</p>
                {card.sub && <p className="text-xs text-gray-500">{card.sub}</p>}
                {card.note && (
                  <p className="text-xs text-gray-400 italic mt-1">{card.note}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <Link href="/opportunities" className="text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl hover:bg-green-100 transition-colors">
              View Funding Opportunities →
            </Link>
            <Link href="/analyzer" className="text-sm text-gray-600 border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              Re-run Analyzer
            </Link>
          </div>
        </div>
      )}

      {/* Tab: Optimization Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Work through these tasks in order to maximize your funding readiness score.
          </p>
          {OPTIMIZATION_TASKS.map((task, idx) => (
            <OptimizationTaskCard key={task.id} task={task} index={idx + 1} isActive={isActive} />
          ))}
        </div>
      )}

      {/* Tab: Dispute Letters */}
      {activeTab === 'disputes' && (
        <div id="dispute-letters" className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              These are <strong>educational letter templates</strong> for your personal use only.
              SourcifyLending does not send letters on your behalf and does not provide credit repair services.
              Review every letter carefully, fill in your information, and send via certified mail with return receipt.
            </p>
          </div>

          <DisputeLetterGenerator isActive={isActive} />
        </div>
      )}
    </div>
  )
}

// ─── Optimization Task Card ─────────────────────────────────────────────────────
function OptimizationTaskCard({
  task,
  index,
  isActive,
}: {
  task: typeof OPTIMIZATION_TASKS[number]
  index: number
  isActive: boolean
}) {
  const [done, setDone] = useState(false)

  return (
    <div className={`bg-white border rounded-2xl p-4 flex gap-3 transition-all ${
      done ? 'border-green-200 opacity-60' : 'border-gray-200'
    }`}>
      <button
        onClick={() => isActive && setDone(!done)}
        className="shrink-0 mt-0.5"
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        disabled={!isActive}
      >
        {done
          ? <CheckCircle size={20} className="text-green-600" />
          : <Circle size={20} className="text-gray-300" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {index}. {task.title}
          </p>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}`}>
            {task.priority === 'high' ? '↑ High' : 'Medium'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{task.description}</p>
        {task.link && (
          <Link
            href={task.link}
            className="inline-block mt-2 text-xs text-green-600 font-semibold hover:text-green-700"
          >
            {task.link === '/opportunities' ? 'View Opportunities →' : 'Jump to Dispute Letters →'}
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Dispute Letter Generator ───────────────────────────────────────────────────
function DisputeLetterGenerator({ isActive }: { isActive: boolean }) {
  const [selectedType, setSelectedType] = useState(DISPUTE_TYPES[0].id)
  const [selectedBureau, setSelectedBureau] = useState(BUREAUS[0])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [generated, setGenerated] = useState('')
  const [copied, setCopied] = useState(false)

  const disputeType = DISPUTE_TYPES.find((d) => d.id === selectedType)!

  function generate() {
    const letter = disputeType.template(fieldValues, selectedBureau)
    setGenerated(letter)
    setCopied(false)
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(generated)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!isActive) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
        <Lock size={28} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-600 mb-1">Subscription Required</p>
        <p className="text-xs text-gray-400 mb-4">Reactivate your membership to generate dispute letters.</p>
        <Link href="/billing" className="text-sm font-bold text-green-700 bg-green-100 px-4 py-2.5 rounded-xl hover:bg-green-200 transition-colors">
          Reactivate
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Dispute Type</label>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value)
              setFieldValues({})
              setGenerated('')
            }}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {DISPUTE_TYPES.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Credit Bureau</label>
          <select
            value={selectedBureau}
            onChange={(e) => setSelectedBureau(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {BUREAUS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Dynamic fields */}
      <div className="space-y-3">
        {disputeType.fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                value={fieldValues[field.key] ?? ''}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                placeholder={field.label}
              />
            ) : (
              <input
                type="text"
                value={fieldValues[field.key] ?? ''}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder={field.label}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={generate}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold text-sm px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        <FileText size={16} />
        Generate Letter
      </button>

      {generated && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Generated Letter — {disputeType.label}</p>
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
            >
              {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {generated}
          </pre>
          <p className="text-xs text-gray-400">
            Review and personalize before sending. Send via certified mail with return receipt to {selectedBureau}.
            Keep a copy for your records.
          </p>
        </div>
      )}
    </div>
  )
}
