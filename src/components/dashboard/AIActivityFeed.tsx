'use client'
import { useState, useEffect } from 'react'
import { Bot, CheckCircle, AlertTriangle, Info, Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

interface AgentAction {
  id: string
  agent_name: string
  action_type: string
  title: string
  description: string | null
  status: string
  auto_fixed: boolean
  needs_review: boolean
  created_at: string
}

const AGENT_LABELS: Record<string, string> = {
  onboarding: 'Onboarding AI',
  document:   'Document AI',
  roadmap:    'Roadmap AI',
  opportunity:'Opportunity AI',
  billing:    'Billing AI',
  support:    'Support AI',
  health:     'Platform AI',
}

const AGENT_COLORS: Record<string, string> = {
  onboarding: 'bg-blue-100 text-blue-700',
  document:   'bg-purple-100 text-purple-700',
  roadmap:    'bg-green-100 text-green-700',
  opportunity:'bg-amber-100 text-amber-700',
  billing:    'bg-rose-100 text-rose-700',
  support:    'bg-indigo-100 text-indigo-700',
  health:     'bg-gray-100 text-gray-600',
}

function ActionIcon({ action }: { action: AgentAction }) {
  if (action.needs_review || action.status === 'pending_approval') {
    return <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
  }
  if (action.auto_fixed || action.action_type === 'task_completed' || action.action_type === 'stage_advanced') {
    return <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
  }
  if (action.action_type === 'flag_raised') {
    return <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
  }
  return <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AIActivityFeed() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/agents/activity?limit=20')
      .then(r => r.json())
      .then(data => setActions(data.actions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 text-sm">AI Activity</p>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-900 text-sm">AI Activity</p>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <Sparkles size={22} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Your AI advisor is warming up.</p>
          <p className="text-xs text-gray-300 mt-1">Activity will appear here as the AI works on your account.</p>
        </div>
      </div>
    )
  }

  const visible = showAll ? actions : actions.slice(0, 5)
  const hasAlerts = actions.some(a => a.needs_review || a.status === 'pending_approval')

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Bot size={16} className="text-green-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">AI Activity</p>
            {hasAlerts && (
              <p className="text-[10px] text-amber-600 font-semibold">Action needed</p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">{actions.length} actions</span>
      </div>

      <div className="space-y-2">
        {visible.map(action => (
          <div
            key={action.id}
            className={`rounded-xl border px-3 py-2.5 transition-all cursor-pointer ${
              action.needs_review || action.status === 'pending_approval'
                ? 'border-amber-200 bg-amber-50'
                : 'border-gray-100 bg-gray-50 hover:bg-white'
            }`}
            onClick={() => setExpanded(expanded === action.id ? null : action.id)}
          >
            <div className="flex items-start gap-2">
              <ActionIcon action={action} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-xs font-semibold leading-snug ${
                    action.needs_review ? 'text-amber-800' : 'text-gray-800'
                  }`}>
                    {action.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${AGENT_COLORS[action.agent_name] ?? 'bg-gray-100 text-gray-500'}`}>
                    {AGENT_LABELS[action.agent_name] ?? action.agent_name}
                  </span>
                  {action.auto_fixed && (
                    <span className="text-[10px] text-green-600 font-medium">Auto-completed</span>
                  )}
                  <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(action.created_at)}</span>
                </div>
              </div>
              {action.description && (
                expanded === action.id
                  ? <ChevronUp size={12} className="text-gray-400 shrink-0 mt-1" />
                  : <ChevronDown size={12} className="text-gray-400 shrink-0 mt-1" />
              )}
            </div>

            {expanded === action.id && action.description && (
              <p className="text-xs text-gray-500 mt-2 leading-relaxed pl-5 border-t border-gray-100 pt-2">
                {action.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {actions.length > 5 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full mt-3 text-xs text-green-600 hover:text-green-700 font-medium py-1.5 text-center"
        >
          {showAll ? 'Show less' : `Show ${actions.length - 5} more`}
        </button>
      )}
    </div>
  )
}
