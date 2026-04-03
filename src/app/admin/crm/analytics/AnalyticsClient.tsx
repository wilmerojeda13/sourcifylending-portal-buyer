'use client'

import CRMWorkspaceNav from '@/components/crm/CRMWorkspaceNav'
import CRMSalesOverview from '@/components/crm/CRMSalesOverview'

export default function AnalyticsClient() {
  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <CRMWorkspaceNav />
        <CRMSalesOverview />
      </div>
    </div>
  )
}
