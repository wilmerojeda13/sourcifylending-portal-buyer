'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBusinessContext } from '@/lib/use-business-context'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'
import type { AccessibleBusiness } from '@/types'

export default function BusinessManagementCard() {
  const router = useRouter()
  const { locale } = useLanguage()
  const text = (key: string, fallback: string) => t(locale, key, fallback)
  const {
    businesses,
    activeBusinessId,
    hasMultipleBusinesses,
    loading: businessLoading,
    refresh: refreshBusinesses,
  } = useBusinessContext()

  const canManageBusinesses = businesses.some((business) => business.role === 'owner' || business.role === 'admin')
  const [switching, setSwitching] = useState(false)
  const [showAddBusiness, setShowAddBusiness] = useState(false)
  const [newBusinessName, setNewBusinessName] = useState('')
  const [newBusinessEntityType, setNewBusinessEntityType] = useState('')
  const [newBusinessIndustry, setNewBusinessIndustry] = useState('')
  const [creatingBusiness, setCreatingBusiness] = useState(false)
  const [businessCreateError, setBusinessCreateError] = useState<string | null>(null)

  useEffect(() => {
    const onRefreshBusinesses = () => {
      refreshBusinesses().catch(() => {})
    }
    window.addEventListener('portal-business-changed', onRefreshBusinesses)
    return () => window.removeEventListener('portal-business-changed', onRefreshBusinesses)
  }, [refreshBusinesses])

  const currentBusiness = businesses.find((business) => business.id === activeBusinessId) ?? null
  const currentBusinessStatusLabel = currentBusiness
    ? currentBusiness.feature_tier === 'free'
      ? text('member.freePlanActive', 'Free Plan Active')
      : currentBusiness.billing_status === 'active' || currentBusiness.billing_status === 'trialing'
        ? text('member.active', 'Active')
        : text('member.subscriptionRequired', 'Subscription Required')
    : text('member.pending', 'Pending')

  const currentBusinessStatusClassName =
    currentBusinessStatusLabel === text('member.active', 'Active') ||
    currentBusinessStatusLabel === text('member.freePlanActive', 'Free Plan Active')
      ? 'border-green-500/30 bg-green-500/10 text-green-300'
      : currentBusinessStatusLabel === text('member.pending', 'Pending')
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'

  const switchBusiness = async (businessId: string) => {
    if (!businessId || businessId === activeBusinessId) return
    const targetBusiness = businesses.find((business) => business.id === businessId) ?? null
    setSwitching(true)
    try {
      await fetch('/api/portal/business-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      await refreshBusinesses()
      if (
        targetBusiness &&
        targetBusiness.feature_tier !== 'free' &&
        !['active', 'trialing'].includes(targetBusiness.billing_status)
      ) {
        router.push('/billing?subscription_required=1')
      } else {
        router.refresh()
      }
    } finally {
      setSwitching(false)
    }
  }

  const createBusiness = async () => {
    const trimmedName = newBusinessName.trim()
    if (!trimmedName) {
      setBusinessCreateError(text('member.businessNameRequired', 'Business name is required.'))
      return
    }

    setCreatingBusiness(true)
    setBusinessCreateError(null)
    try {
      const res = await fetch('/api/portal/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: trimmedName,
          entity_type: newBusinessEntityType,
          industry: newBusinessIndustry,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || text('member.failedToAddBusiness', 'Failed to add business'))
      }

      setShowAddBusiness(false)
      setNewBusinessName('')
      setNewBusinessEntityType('')
      setNewBusinessIndustry('')
      await refreshBusinesses()
      router.push(data?.redirect_to || '/dashboard')
      router.refresh()
    } catch (error) {
      setBusinessCreateError(
        error instanceof Error ? error.message : text('member.failedToAddBusiness', 'Failed to add business')
      )
    } finally {
      setCreatingBusiness(false)
    }
  }

  if (businesses.length === 0) {
    if (businessLoading) {
      return <div className="h-11 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
    }
    return null
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-gray-200/70 bg-white/90 p-3 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              {text('member.business', 'Business')}
            </p>
            {currentBusiness && (
              <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {currentBusiness.label}
              </p>
            )}
          </div>
          {canManageBusinesses && (
            <button
              type="button"
              onClick={() => {
                setBusinessCreateError(null)
                setShowAddBusiness(true)
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-green-500/30 hover:bg-green-500/10 hover:text-green-300 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300"
            >
              <Plus size={12} />
              {text('member.addBusiness', 'Add Business')}
            </button>
          )}
        </div>

        <div className="mt-2 space-y-2">
          <select
            value={activeBusinessId ?? ''}
            onChange={(event) => switchBusiness(event.target.value)}
            disabled={switching || businessLoading || businesses.length <= 1}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {businesses.map((business: AccessibleBusiness) => {
              const optionSuffix = business.feature_tier === 'free'
                ? ` - ${text('member.freePlanActive', 'Free Plan Active')}`
                : !['active', 'trialing'].includes(business.billing_status)
                  ? ` - ${text('member.subscriptionRequired', 'Subscription Required')}`
                  : ''

              return (
                <option key={business.id} value={business.id}>
                  {business.label}
                  {optionSuffix}
                </option>
              )
            })}
          </select>

          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                currentBusinessStatusClassName
              )}
            >
              {currentBusinessStatusLabel}
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-gray-400">
            {hasMultipleBusinesses
              ? `${businesses.length} ${text('member.businessCount', 'businesses on this login')}`
              : text(
                  'member.businessDescription',
                  'Each business keeps its own subscription, documents, and portal progress.'
                )}
          </p>
        </div>
      </div>

      {showAddBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {text('member.addBusinessTitle', 'Add Business')}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {text(
                    'member.addBusinessDescription',
                    'Create a separate business profile under this login. Each business requires its own subscription.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !creatingBusiness && setShowAddBusiness(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {text('member.businessName', 'Business Name')}
                </label>
                <input
                  value={newBusinessName}
                  onChange={(event) => setNewBusinessName(event.target.value)}
                  placeholder={text('member.businessPlaceholder', 'Acme Trucking LLC')}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {text('member.entityType', 'Entity Type')}
                  </label>
                  <input
                    value={newBusinessEntityType}
                    onChange={(event) => setNewBusinessEntityType(event.target.value)}
                    placeholder={text('member.entityPlaceholder', 'LLC')}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {text('member.industry', 'Industry')}
                  </label>
                  <input
                    value={newBusinessIndustry}
                    onChange={(event) => setNewBusinessIndustry(event.target.value)}
                    placeholder={text('member.industryPlaceholder', 'Trucking')}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              {businessCreateError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {businessCreateError}
                </p>
              )}
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {text(
                  'member.newBusinessWarning',
                  'New businesses start unsubscribed and will be sent to checkout before portal features unlock.'
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowAddBusiness(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {text('member.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={createBusiness}
                disabled={creatingBusiness}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                <Plus size={14} />
                {creatingBusiness
                  ? text('member.creating', 'Creating...')
                  : text('member.createBusiness', 'Create Business')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
