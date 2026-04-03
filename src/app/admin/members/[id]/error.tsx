'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AdminMemberDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin/member-detail] render error', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="max-w-lg w-full rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Member detail unavailable</h1>
        <p className="mt-2 text-sm text-gray-600">
          This record has malformed or incomplete data. The admin page no longer white-screens, but this specific view needs review.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Retry
          </button>
          <Link
            href="/admin/members"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to members
          </Link>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-gray-400">Error digest: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
