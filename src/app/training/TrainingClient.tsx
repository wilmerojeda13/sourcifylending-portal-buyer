'use client'

import { useState, useEffect } from 'react'
import { PlayCircle, CheckCircle, Clock, Lock, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrainingVideo {
  id: string
  title: string
  description: string
  duration: string          // e.g. "3:45"
  category: string
  program: 'all' | 'program_a' | 'program_b'
  embedUrl: string          // YouTube / Loom / Guidde embed URL — leave blank = "Coming Soon"
  order: number
}

const VIDEOS: TrainingVideo[] = [
  // ── Getting Started ──────────────────────────────────────────────────────
  {
    id: 'gs-01',
    title: 'Welcome to the Sourcify Portal',
    description: 'A quick walkthrough of every section in the portal so you know where everything lives.',
    duration: '',
    category: 'Getting Started',
    program: 'all',
    embedUrl: '',
    order: 1,
  },
  {
    id: 'gs-02',
    title: 'Setting Up Your Profile & Documents',
    description: 'How to upload your required documents and complete your underwriting profile.',
    duration: '',
    category: 'Getting Started',
    program: 'all',
    embedUrl: '',
    order: 2,
  },
  {
    id: 'gs-03',
    title: 'How to Use the AI Assistant',
    description: 'Your AI agent knows your account. Learn how to ask it questions and get instant guidance.',
    duration: '',
    category: 'Getting Started',
    program: 'all',
    embedUrl: '',
    order: 3,
  },

  // ── Program A — Credit Optimization ──────────────────────────────────────
  {
    id: 'pa-01',
    title: 'Program A Overview — 0% APR Strategy',
    description: 'How the 0% APR business funding program works from start to finish.',
    duration: '',
    category: 'Program A — Credit Optimization',
    program: 'program_a',
    embedUrl: '',
    order: 1,
  },
  {
    id: 'pa-02',
    title: 'Understanding Your Credit Score Requirements',
    description: 'What scores you need, which bureaus matter, and how to optimize before applying.',
    duration: '',
    category: 'Program A — Credit Optimization',
    program: 'program_a',
    embedUrl: '',
    order: 2,
  },
  {
    id: 'pa-03',
    title: 'Navigating Opportunities — Cards & Timing',
    description: 'How to read your Opportunities page and know when to apply for each card.',
    duration: '',
    category: 'Program A — Credit Optimization',
    program: 'program_a',
    embedUrl: '',
    order: 3,
  },
  {
    id: 'pa-04',
    title: 'Submitting Funding Results',
    description: 'What to do once you get approved — how to log your results and track your funding.',
    duration: '',
    category: 'Program A — Credit Optimization',
    program: 'program_a',
    embedUrl: '',
    order: 4,
  },

  // ── Program B — Business Credit ───────────────────────────────────────────
  {
    id: 'pb-01',
    title: 'Program B Overview — Business Credit Building',
    description: 'How the business credit program works: foundation → tradelines → cash funding.',
    duration: '',
    category: 'Program B — Business Credit',
    program: 'program_b',
    embedUrl: '',
    order: 1,
  },
  {
    id: 'pb-02',
    title: 'Business Foundation — EIN, DUNS & Registrations',
    description: 'Step-by-step: how to get your business properly set up for credit reporting.',
    duration: '',
    category: 'Program B — Business Credit',
    program: 'program_b',
    embedUrl: '',
    order: 2,
  },
  {
    id: 'pb-03',
    title: 'Syncing Your Nav Credit Scores',
    description: 'How to paste your Nav dashboard data to sync PAYDEX, Experian, and Equifax scores.',
    duration: '',
    category: 'Program B — Business Credit',
    program: 'program_b',
    embedUrl: '',
    order: 3,
  },
  {
    id: 'pb-04',
    title: 'Net-30 Vendors & Building Tradelines',
    description: 'Which vendors to start with, how to apply, and when to expect reporting.',
    duration: '',
    category: 'Program B — Business Credit',
    program: 'program_b',
    embedUrl: '',
    order: 4,
  },

  // ── Progress & Documents ──────────────────────────────────────────────────
  {
    id: 'pd-01',
    title: 'Tracking Your Roadmap Progress',
    description: 'How to use the Progress page to complete tasks and advance through your program stages.',
    duration: '',
    category: 'Progress & Documents',
    program: 'all',
    embedUrl: '',
    order: 1,
  },
  {
    id: 'pd-02',
    title: 'Uploading & Managing Documents',
    description: 'What documents are required, how to upload them, and what happens after you do.',
    duration: '',
    category: 'Progress & Documents',
    program: 'all',
    embedUrl: '',
    order: 2,
  },

  // ── Billing & Support ─────────────────────────────────────────────────────
  {
    id: 'bs-01',
    title: 'Understanding Your Billing & Payments',
    description: 'How billing works, when payments are drafted, and how to read your invoice.',
    duration: '',
    category: 'Billing & Support',
    program: 'all',
    embedUrl: '',
    order: 1,
  },
  {
    id: 'bs-02',
    title: 'How to Contact Support',
    description: 'How to use the Support Inbox to send messages and get responses from our team.',
    duration: '',
    category: 'Billing & Support',
    program: 'all',
    embedUrl: '',
    order: 2,
  },
]

const CATEGORY_ORDER = [
  'Getting Started',
  'Program A — Credit Optimization',
  'Program B — Business Credit',
  'Progress & Documents',
  'Billing & Support',
]

interface Props {
  userId: string
  assignedProgram: string | null
}

export default function TrainingClient({ userId, assignedProgram }: Props) {
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [activeVideo, setActiveVideo] = useState<TrainingVideo | null>(null)

  // Persist watched state per user in localStorage
  const storageKey = `training_watched_${userId}`

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setWatched(new Set(JSON.parse(raw)))
    } catch {}
  }, [storageKey])

  const markWatched = (id: string) => {
    setWatched(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(storageKey, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // Filter by program relevance
  const visibleVideos = VIDEOS.filter(v =>
    v.program === 'all' ||
    v.program === assignedProgram ||
    !assignedProgram
  )

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, TrainingVideo[]>>((acc, cat) => {
    const vids = visibleVideos.filter(v => v.category === cat).sort((a, b) => a.order - b.order)
    if (vids.length) acc[cat] = vids
    return acc
  }, {})

  const totalWatched = visibleVideos.filter(v => watched.has(v.id)).length

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Center</h1>
          <p className="text-gray-500 text-sm mt-1">
            Step-by-step videos to help you get the most out of your program.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5 text-sm">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-green-700 dark:text-green-400">
            {totalWatched} / {visibleVideos.length} watched
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full progress-bar-fill"
          style={{ width: `${visibleVideos.length ? (totalWatched / visibleVideos.length) * 100 : 0}%` }}
        />
      </div>

      {/* Video categories */}
      {Object.entries(grouped).map(([category, videos]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 dark:border-gray-800 pb-2">
            {category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isWatched={watched.has(video.id)}
                onClick={() => {
                  if (video.embedUrl) {
                    setActiveVideo(video)
                    markWatched(video.id)
                  }
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Video modal */}
      {activeVideo && (
        <VideoModal
          video={activeVideo}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  )
}

function VideoCard({
  video,
  isWatched,
  onClick,
}: {
  video: TrainingVideo
  isWatched: boolean
  onClick: () => void
}) {
  const hasVideo = !!video.embedUrl
  return (
    <button
      onClick={onClick}
      disabled={!hasVideo}
      className={cn(
        'group text-left rounded-2xl border p-4 transition-all duration-150',
        hasVideo
          ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 cursor-pointer'
          : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 cursor-default opacity-75'
      )}
    >
      {/* Thumbnail area */}
      <div className={cn(
        'w-full aspect-video rounded-xl mb-3 flex items-center justify-center relative overflow-hidden',
        hasVideo ? 'bg-gray-900' : 'bg-gray-100 dark:bg-gray-800'
      )}>
        {hasVideo ? (
          <>
            <PlayCircle className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-150" />
            {isWatched && (
              <div className="absolute top-2 right-2 bg-green-500 rounded-full p-0.5">
                <CheckCircle className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <Lock className="w-5 h-5" />
            <span className="text-xs font-medium">Coming Soon</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1">
        <p className={cn(
          'text-sm font-semibold leading-snug',
          hasVideo ? 'text-gray-900' : 'text-gray-500'
        )}>
          {video.title}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {video.description}
        </p>
        <div className="flex items-center gap-2 pt-1">
          {video.duration && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {video.duration}
            </span>
          )}
          {isWatched && hasVideo && (
            <span className="text-xs text-green-600 font-medium">Watched</span>
          )}
        </div>
      </div>
    </button>
  )
}

function VideoModal({ video, onClose }: { video: TrainingVideo; onClose: () => void }) {
  // Close on backdrop click
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">{video.category}</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{video.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={video.embedUrl.replace('/embed/', '/watch?v=').replace('loom.com/embed/', 'loom.com/share/')}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video embed */}
        <div className="aspect-video w-full bg-black">
          <iframe
            src={video.embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>

        {/* Description */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">{video.description}</p>
        </div>
      </div>
    </div>
  )
}
