'use client'

export default function OfflineCRMError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-red-800/40 bg-red-950/30 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-300">Offline CRM Error</p>
          <h1 className="mt-2 text-2xl font-bold">The offline CRM route crashed</h1>
          <p className="mt-2 text-sm text-red-100/80">
            This screen is here so we can see the real error instead of the generic Next.js app error page.
          </p>
        </div>

        <div className="rounded-2xl border border-red-800/40 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-wide text-red-200/70">Message</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-red-100">{error.message || 'Unknown client error'}</pre>
        </div>

        {error.digest && (
          <div className="rounded-2xl border border-red-800/40 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-red-200/70">Digest</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-red-100">{error.digest}</pre>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-400"
          >
            Retry route
          </button>
          <a
            href="https://sourcifylending-portal-7vts8d18p-sourcifylending-5857s-projects.vercel.app/offline-crm"
            className="rounded-2xl border border-red-700/40 px-4 py-2.5 text-sm font-medium text-red-100 hover:bg-red-500/10"
          >
            Reload current deployment
          </a>
        </div>
      </div>
    </div>
  )
}
