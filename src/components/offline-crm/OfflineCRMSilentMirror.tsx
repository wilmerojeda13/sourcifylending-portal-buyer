'use client'

import { useCallback, useEffect, useRef } from 'react'
import { replaceOfflineSnapshot, updateOfflineMeta } from '@/lib/offline-crm-db'
import { bootstrapOfflineCRM, runOfflineCRMSync } from '@/lib/offline-crm-sync'

const REFRESH_INTERVAL_MS = 1000 * 60 * 2

export default function OfflineCRMSilentMirror() {
  const runningRef = useRef(false)

  const syncMirror = useCallback(async () => {
    if (runningRef.current || typeof window === 'undefined' || !navigator.onLine) return
    runningRef.current = true
    try {
      try {
        await runOfflineCRMSync()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Background CRM sync failed.'
        if (message.toLowerCase() !== 'unauthorized') {
          await updateOfflineMeta({ last_sync_error: message })
        }
      }

      const snapshot = await bootstrapOfflineCRM()
      await replaceOfflineSnapshot({
        leads: snapshot.leads,
        tasks: snapshot.tasks,
        calls: snapshot.calls,
        generatedAt: snapshot.generated_at,
      })
      await updateOfflineMeta({
        admin_user_id: snapshot.user.id,
        admin_name: snapshot.user.name,
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Background CRM mirror failed.'
      if (message.toLowerCase() !== 'unauthorized') {
        await updateOfflineMeta({ last_sync_error: message })
      }
    } finally {
      runningRef.current = false
    }
  }, [])

  useEffect(() => {
    syncMirror().catch(() => {})

    const interval = window.setInterval(() => {
      syncMirror().catch(() => {})
    }, REFRESH_INTERVAL_MS)

    const onOnline = () => {
      syncMirror().catch(() => {})
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncMirror().catch(() => {})
      }
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [syncMirror])

  return null
}
