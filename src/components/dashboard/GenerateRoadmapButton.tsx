'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

export default function GenerateRoadmapButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { locale } = useLanguage()
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      // Safety gate: verify underwriting is complete before generating roadmap
      const statusRes = await fetch('/api/underwriting')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (statusData.needs_underwriting) {
          router.push('/underwriting')
          return
        }
      }

      const res = await fetch('/api/tasks/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || text('progress.genericError', 'Something went wrong. Please try again.'))
      } else {
        // Log roadmap generation event (fire-and-forget)
        fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'roadmap_generated' }),
        }).catch(() => {})
        // Refresh the page to show the newly generated tasks
        router.refresh()
      }
    } catch {
      setError(text('progress.genericError', 'Something went wrong. Please try again.'))
    }
    setLoading(false)
  }

  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <Sparkles size={20} className="text-green-600" />
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
        {text('progress.readyToBuild', 'Ready to build your roadmap?')}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed mb-4">
        {text('progress.aiAdvisorTaskList', 'Our AI advisor will generate your personalized task list based on your profile and program.')}
      </p>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {text('progress.generating', 'Generating your roadmap...')}
          </>
        ) : (
          <>
            <Sparkles size={14} />
            {text('progress.generateRoadmap', 'Generate My Roadmap')}
          </>
        )}
      </button>
    </div>
  )
}
