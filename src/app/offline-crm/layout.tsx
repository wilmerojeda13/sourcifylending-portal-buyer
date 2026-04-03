import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SourcifyLending Sales CRM',
  description: 'Local mirror of the SourcifyLending sales CRM',
  manifest: '/offline-crm.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sales CRM',
  },
}

export default function OfflineCRMLayout({ children }: { children: React.ReactNode }) {
  return children
}
