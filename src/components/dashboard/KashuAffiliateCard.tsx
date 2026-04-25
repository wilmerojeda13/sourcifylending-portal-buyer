'use client'

import { useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import { useTrackEvent } from '@/hooks/useTrackEvent'

interface KashuAffiliateCardProps {
  isEligible: boolean
}

export default function KashuAffiliateCard({ isEligible }: KashuAffiliateCardProps) {
  const { track } = useTrackEvent()

  const handleKashuClick = useCallback(async () => {
    await track({
      action_type: 'kashu_affiliate_click',
      program: 'program_a',
      metadata: {
        timestamp: new Date().toISOString(),
      },
    })
  }, [track])

  if (!isEligible) return null

  const kashuUrl = process.env.NEXT_PUBLIC_KASHU_AFFILIATE_URL || 'https://signup.kashupay.com?referrer=QocxmFiGV17zvJ'

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl px-5 py-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <p className="text-xs font-medium text-blue-200 mb-1">Next Steps</p>
        <h3 className="text-lg font-bold text-white mb-1">
          Need to turn card access into cash?
        </h3>
        <p className="text-sm text-blue-100 leading-relaxed">
          You may be able to use Kashu, a third-party service, to explore converting business credit card access into working capital.
        </p>
        <p className="text-xs text-blue-300 mt-3 italic">
          Third-party service. Terms, eligibility, fees, and provider rules apply. SourcifyLending may receive compensation if you use this referral link.
        </p>
      </div>
      <div className="shrink-0">
        <a
          href={kashuUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleKashuClick}
          className="inline-flex items-center gap-1.5 bg-white text-blue-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap"
        >
          Explore Kashu <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}
