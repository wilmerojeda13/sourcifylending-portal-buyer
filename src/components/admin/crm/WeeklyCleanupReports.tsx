'use client'

import { useState, useEffect } from 'react'
import { Calendar, TrendingUp, AlertCircle, CheckCircle2, Clock, Users, PhoneMissed, Ban, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CleanupReport {
  id: string
  report_date: string
  total_leads_processed: number
  status_counts: Record<string, number>
  health_tier_distribution: Record<string, number>
  leads_flagged_for_review: number
  auto_approved_changes: number
  processing_time_ms: number
  error_count: number
  error_details: any[]
  created_at: string
}

interface WeeklyCleanupReportsProps {
  className?: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-600',
  voicemail_heavy: 'text-amber-600',
  unresponsive: 'text-red-600',
  bad_number: 'text-gray-600',
  retry_later: 'text-blue-600',
  dnc: 'text-red-700',
  nurture: 'text-purple-600',
}

const HEALTH_TIER_COLORS: Record<string, string> = {
  tier_1: 'text-green-600',
  tier_2: 'text-blue-600',
  tier_3: 'text-amber-600',
  tier_4: 'text-orange-600',
  tier_5: 'text-red-600',
}

export default function WeeklyCleanupReports({ className }: WeeklyCleanupReportsProps) {
  const [reports, setReports] = useState<CleanupReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/crm/scrubber/reports?limit=10')
      if (!response.ok) {
        throw new Error('Failed to load reports')
      }
      const data = await response.json()
      setReports(data.reports || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatProcessingTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle size={20} />
          <span>Failed to load cleanup reports</span>
        </div>
        <button
          onClick={loadReports}
          className="btn-secondary px-4 py-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Cleanup Reports</h3>
        <p className="text-gray-500">Weekly cleanup reports will appear here once the system runs.</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Weekly Cleanup Reports</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar size={16} />
          <span>Last {reports.length} weeks</span>
        </div>
      </div>

      <div className="space-y-4">
        {reports.map((report) => (
          <div key={report.id} className="bg-white border border-gray-200 rounded-lg p-6">
            {/* Report Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {formatDate(report.report_date)}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(report.created_at).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Clock size={16} className="text-gray-400" />
                  <span className="text-gray-600">{formatProcessingTime(report.processing_time_ms)}</span>
                </div>
                {report.error_count > 0 && (
                  <div className="flex items-center gap-1 text-red-600">
                    <AlertCircle size={16} />
                    <span>{report.error_count} errors</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{report.total_leads_processed.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Leads Processed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{report.leads_flagged_for_review.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Flagged for Review</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{report.auto_approved_changes.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Auto-Approved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{((report.auto_approved_changes / report.total_leads_processed) * 100).toFixed(1)}%</div>
                <div className="text-sm text-gray-500">Automation Rate</div>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Filter size={16} />
                Status Distribution
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(report.status_counts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className={cn('text-sm font-medium capitalize', STATUS_COLORS[status] || 'text-gray-600')}>
                      {status.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-600">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Health Tier Distribution */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp size={16} />
                Health Tier Distribution
              </h4>
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(report.health_tier_distribution)
                  .sort(([a], [b]) => parseInt(a.replace('tier_', '')) - parseInt(b.replace('tier_', '')))
                  .map(([tier, count]) => (
                    <div key={tier} className="text-center p-2 bg-gray-50 rounded">
                      <div className={cn('text-lg font-bold', HEALTH_TIER_COLORS[tier] || 'text-gray-600')}>
                        {count.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {tier.replace('_', ' ').replace(/\d/, (match) => ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'][parseInt(match) - 1])}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Error Details */}
            {report.error_count > 0 && report.error_details && report.error_details.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <h4 className="text-sm font-medium text-red-800 mb-2">Error Details</h4>
                <div className="space-y-1">
                  {report.error_details.slice(0, 3).map((error, index) => (
                    <div key={index} className="text-xs text-red-700">
                      Lead {error.lead_id}: {error.error}
                    </div>
                  ))}
                  {report.error_details.length > 3 && (
                    <div className="text-xs text-red-600">
                      ... and {report.error_details.length - 3} more errors
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
