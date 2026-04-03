'use client'

import Link, { type LinkProps } from 'next/link'
import type { PropsWithChildren } from 'react'

type Props = PropsWithChildren<LinkProps & {
  className?: string
  pageId: string
  destinationPath: string
}>

export default function TrackedContentLink({
  pageId,
  destinationPath,
  className,
  children,
  ...props
}: Props) {
  function handleClick() {
    if (typeof window === 'undefined') return

    fetch('/api/content/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'visit',
        eventAction: 'portal_click',
        pageId,
        path: `${window.location.pathname}${window.location.search}`,
        currentUrl: window.location.href,
        destinationPath,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {})
  }

  return (
    <Link {...props} className={className} onClick={handleClick}>
      {children}
    </Link>
  )
}
