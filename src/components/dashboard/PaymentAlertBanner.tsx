'use client'

import { useState } from 'react'
import { AlertTriangle, CreditCard, Calendar, RefreshCw, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PaymentAlert {
  type: 'balance_due' | 'arrangement_due' | 'renewal_upcoming' | 'past_due'
  urgency: 'critical' | 'warning' | 'info'
  title: string
  message: string
  amountDue?: number
  balanceRemaining?: number
  dueDate?: string
  daysUntilDue?: number
  notes?: string
}

interface Props {
  alerts: PaymentAlert[]
}

// ─── Config per alert type ────────────────────────────────────────────────────
const ALERT_CONFIG = {
  past_due: {
    icon: AlertTriangle,
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-800 dark:text-red-300',
    msgColor: 'text-red-700 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/50',
    badgeText: 'text-red-700 dark:text-red-300',
    ctaClass: 'bg-red-600 hover:bg-red-700 text-white',
    ctaLabel: 'Update Payment Method',
  },
  balance_due: {
    icon: CreditCard,
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconColor: 'text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-800 dark:text-amber-300',
    msgColor: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
    badgeText: 'text-amber-700 dark:text-amber-300',
    ctaClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    ctaLabel: 'View Payment Details',
  },
  arrangement_due: {
    icon: Calendar,
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconColor: 'text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-800 dark:text-amber-300',
    msgColor: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
    badgeText: 'text-amber-700 dark:text-amber-300',
    ctaClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    ctaLabel: 'View Schedule',
  },
  renewal_upcoming: {
    icon: RefreshCw,
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-800 dark:text-blue-300',
    msgColor: 'text-blue-700 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/50',
    badgeText: 'text-blue-700 dark:text-blue-300',
    ctaClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    ctaLabel: 'Manage Subscription',
  },
} as const

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// ─── Component ────────────────────────────────────────────────────────────────
export default function PaymentAlertBanner({ alerts }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  if (!alerts || alerts.length === 0) return null

  const visible = alerts.filter(a => !dismissed.has(a.type))
  if (visible.length === 0) return null

  return (
    <div className="space-y-3 mb-5">
      {visible.map(alert => {
        const cfg = ALERT_CONFIG[alert.type]
        const Icon = cfg.icon
        // Only allow dismiss on non-critical alerts
        const canDismiss = alert.urgency !== 'critical'

        return (
          <div
            key={alert.type}
            className={`${cfg.bg} ${cfg.border} border rounded-2xl p-4`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${cfg.badgeBg}`}>
                <Icon size={18} className={cfg.iconColor} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={`font-semibold text-sm ${cfg.titleColor}`}>{alert.title}</p>
                  {canDismiss && (
                    <button
                      onClick={() => setDismissed(prev => new Set([...prev, alert.type]))}
                      className={`shrink-0 ${cfg.iconColor} opacity-60 hover:opacity-100 transition-opacity`}
                      aria-label="Dismiss"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <p className={`text-xs leading-relaxed ${cfg.msgColor}`}>{alert.message}</p>

                {/* Notes (if any) */}
                {alert.notes && (
                  <p className={`text-xs mt-1 opacity-80 italic ${cfg.msgColor}`}>{alert.notes}</p>
                )}

                {/* Payment details row */}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {alert.amountDue !== undefined && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                      {fmt(alert.amountDue)}{alert.type === 'renewal_upcoming' ? '/mo' : ' due'}
                    </span>
                  )}
                  {alert.balanceRemaining !== undefined && alert.balanceRemaining !== alert.amountDue && (
                    <span className={`text-xs font-semibold ${cfg.msgColor}`}>
                      Balance: {fmt(alert.balanceRemaining)}
                    </span>
                  )}
                  {alert.dueDate && (
                    <span className={`text-xs ${cfg.msgColor}`}>
                      {alert.type === 'renewal_upcoming' ? 'Renews' : 'Due'}: {fmtDate(alert.dueDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-3 ml-12">
              <Link
                href="/billing"
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${cfg.ctaClass}`}
              >
                {cfg.ctaLabel} <ExternalLink size={11} />
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
