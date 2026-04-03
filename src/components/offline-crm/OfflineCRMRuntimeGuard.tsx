'use client'

import { Component, ReactNode, useEffect, useState } from 'react'

function RuntimeErrorScreen({
  title,
  message,
  digest,
  onRetry,
}: {
  title: string
  message: string
  digest?: string | null
  onRetry?: () => void
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-red-800/40 bg-red-950/30 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-300">Offline CRM Runtime Error</p>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
        </div>
        <div className="rounded-2xl border border-red-800/40 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-wide text-red-200/70">Message</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-red-100">{message}</pre>
        </div>
        {digest ? (
          <div className="rounded-2xl border border-red-800/40 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-red-200/70">Digest</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-red-100">{digest}</pre>
          </div>
        ) : null}
        {onRetry ? (
          <button
            onClick={onRetry}
            className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-400"
          >
            Retry offline CRM
          </button>
        ) : null}
      </div>
    </div>
  )
}

class OfflineCRMErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string; digest?: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '', digest: null }
  }

  static getDerivedStateFromError(error: Error & { digest?: string }) {
    return {
      hasError: true,
      message: error?.message || 'Unknown render error',
      digest: error?.digest ?? null,
    }
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <RuntimeErrorScreen
          title="The offline CRM render tree crashed"
          message={this.state.message}
          digest={this.state.digest}
          onRetry={() => window.location.reload()}
        />
      )
    }

    return this.props.children
  }
}

function OfflineCRMWindowErrorGuard({ children }: { children: ReactNode }) {
  const [runtimeError, setRuntimeError] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setRuntimeError({
        title: 'A window error interrupted the offline CRM',
        message: event.error?.message || event.message || 'Unknown window error',
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      setRuntimeError({
        title: 'An unhandled promise rejection interrupted the offline CRM',
        message:
          typeof reason === 'string'
            ? reason
            : reason?.message || JSON.stringify(reason, null, 2) || 'Unknown promise rejection',
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  if (runtimeError) {
    return (
      <RuntimeErrorScreen
        title={runtimeError.title}
        message={runtimeError.message}
        onRetry={() => window.location.reload()}
      />
    )
  }

  return <>{children}</>
}

export default function OfflineCRMRuntimeGuard({ children }: { children: ReactNode }) {
  return (
    <OfflineCRMErrorBoundary>
      <OfflineCRMWindowErrorGuard>{children}</OfflineCRMWindowErrorGuard>
    </OfflineCRMErrorBoundary>
  )
}
