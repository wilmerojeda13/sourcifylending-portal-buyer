'use client'

import { useEffect } from 'react'

export default function ContentAttributionTracker({
  pageId,
  path,
}: {
  pageId: string
  path: string
}) {
  useEffect(() => {
    const sessionKey = `sl-content-visit:${pageId}`
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(sessionKey)) return

    window.sessionStorage.setItem(sessionKey, '1')
    fetch('/api/content/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'visit',
        eventAction: 'page_visit',
        pageId,
        path: `${window.location.pathname}${window.location.search}` || path,
        currentUrl: window.location.href,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [pageId, path])

  return null
}
