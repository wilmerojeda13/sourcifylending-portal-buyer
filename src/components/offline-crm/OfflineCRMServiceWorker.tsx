'use client'

import { useEffect } from 'react'
import { updateOfflineMeta } from '@/lib/offline-crm-db'

export default function OfflineCRMServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/offline-crm-sw.js', { scope: '/' })
      .then(() => updateOfflineMeta({ installed: true }).catch(() => {}))
      .catch(() => {})
  }, [])

  return null
}
