'use client'
import { useState, useEffect } from 'react'
import PortalLayout from '@/components/layout/PortalLayout'
import { createClient } from '@/lib/supabase/client'
import { getProgramShortLabel, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { CreditCard, CheckCircle, Shield, Loader2 } from 'lucide-react'
import type { UserProfile } from '@/types'
import toast from 'react-hot-toast'

const PLAN_FEATURES: Record<string, string[]> = {
  program_a: [
    'Full 0% APR Card Strategy program',
    'AI Fulfillment Agent — full access',
    'Application sequencing guidance',
    'Card acquisition tracking',
    'Optimization stage support',
    'Document manager',
    'Report generation',
  ],
  program_b: [
    'Full Business Credit Builder program',
    'AI Fulfillment Agent — full access',
    'Vendor account guidance',
    'Tradeline progress tracking',
    'PAYDEX preparation support',
    'Document manager',
    'Monthly reports',
  ],
  program_c: [
    'Monthly Capital Monitoring',
    'AI Fulfillment Agent — full access',
    'Monthly credit snapshot',
    'Banking analysis',
    'Obligation risk scan',
    '30-day action plan',
    'Do/Don\'t monthly rules',
  ],
}

const PLAN_PRICES: Record<string, string> = {
  program_a: '$297/month',
  program_b: '$197/month',
  program_c: '$97/month',
}

export default function BillingPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing'

  const handleSubscribe = async () => {
    if (!profile?.assigned_program) {
      toast.error('Please run the analyzer first to get a program assigned')
      return
    }
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program: profile.assigned_program }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to start checkout')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    }
    setCheckoutLoading(false)
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to open billing portal')
      }
    } catch {
      toast.error('Something went wrong.')
    }
    setPortalLoading(false)
  }

  if (loading) {
    return (
      <PortalLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-48 bg-gray-200 rounded-2xl" />
        </div>
      </PortalLayout>
    )
  }

  const program = profile?.assigned_program || null
  const features = program ? PLAN_FEATURES[program] : []
  const price = program ? PLAN_PRICES[program] : ''

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
    >
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <CreditCard size={24} className="text-green-500" />
          Billing & Subscription
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage your SourcifyLending membership</p>
      </div>

      {/* Current Status */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Subscription Status</p>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={profile?.subscription_status || 'inactive'} />
              <span className="font-bold text-gray-900">{getProgramShortLabel(program)}</span>
            </div>
            {price && <p className="text-2xl font-bold text-green-600">{price}</p>}
          </div>
          {isActive ? (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="btn-secondary text-sm"
            >
              {portalLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              Manage Subscription
            </button>
          ) : null}
        </div>

        {!isActive && (
          <div className="mt-4 pt-4 border-t border-gray-100 bg-amber-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Membership Inactive</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Your roadmap progress is paused. Reactivate your subscription to continue from your current stage and regain full AI agent access.
            </p>
          </div>
        )}
      </div>

      {/* Plan Details */}
      {program && (
        <div className="card mb-6">
          <h2 className="section-title mb-4">Your Plan — {getProgramShortLabel(program)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscribe / Reactivate CTA */}
      {!isActive && (
        <div className="card bg-gradient-to-br from-green-600 to-green-800 border-0 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Shield size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-lg mb-1">
                {profile?.subscription_status === 'canceled' ? 'Reactivate Your Membership' : 'Start Your Program'}
              </h3>
              <p className="text-green-200 text-sm mb-5 leading-relaxed">
                {profile?.subscription_status === 'canceled'
                  ? `Your progress is saved. Reactivate to continue from Stage: ${profile?.current_stage || 'where you left off'}.`
                  : `Subscribe to unlock full AI fulfillment, task tracking, document management, and reports for ${getProgramShortLabel(program)}.`
                }
              </p>
              {price && (
                <p className="text-white font-bold text-xl mb-4">{price}</p>
              )}
              <button
                onClick={handleSubscribe}
                disabled={checkoutLoading || !program}
                className="bg-white text-green-700 font-bold px-8 py-3.5 rounded-xl hover:bg-green-50 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {checkoutLoading ? 'Starting checkout…' : 'Subscribe Now'}
              </button>
              {!program && (
                <p className="text-green-300 text-xs mt-3">
                  Run the analyzer first to get a program assigned — <a href="/analyzer" className="text-white underline">Free Analyzer</a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legal Disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed px-2">
        Subscriptions are billed monthly. Cancel anytime. Cancellation pauses progress and limits portal access — data is never deleted. SourcifyLending does not guarantee specific credit approvals, credit limits, or funding outcomes.
      </p>
    </PortalLayout>
  )
}
