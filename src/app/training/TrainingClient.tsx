'use client'

import { useState, useEffect } from 'react'
import { PlayCircle, CheckCircle, Clock, Lock, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrainingVideo {
  id: string
  title: string
  description: string
  duration: string
  category: string
  program: 'all' | 'program_a' | 'program_b'
  embed_url: string
  is_published: boolean
  sort_order: number
}

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
  videos: TrainingVideo[]
}

export default function TrainingClient({ userId, assignedProgram, videos }: Props) {
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [activeVideo, setActiveVideo] = useState<TrainingVideo | null>(null)

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

  const visibleVideos = videos.filter(v =>
    v.program === 'all' || v.program === assignedProgram || !assignedProgram
  )

  const grouped = CATEGORY_ORDER.reduce<Record<string, TrainingVideo[]>>((acc, cat) => {
    const vids = visibleVideos.filter(v => v.category === cat).sort((a, b) => a.sort_order - b.sort_order)
    if (vids.length) acc[cat] = vids
    return acc
  }, {})

  const totalWatched = visibleVideos.filter(v => watched.has(v.id)).length

  if (visibleVideos.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Training Center</h1>
        <div className="mt-16 text-center text-gray-400">
          <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Training videos are coming soon. Check back shortly!</p>
        </div>
      </div>
    )
  }

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
      {Object.entries(grouped).map(([category, catVideos]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 dark:border-gray-800 pb-2">
            {category}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catVideos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isWatched={watched.has(video.id)}
                onClick={() => {
                  if (video.embed_url) {
                    setActiveVideo(video)
                    markWatched(video.id)
                  }
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {activeVideo && (
        <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  )
}

function VideoCard({ video, isWatched, onClick }: { video: TrainingVideo; isWatched: boolean; onClick: () => void }) {
  const hasVideo = !!video.embed_url
  const thumbnail = hasVideo ? getThumbnail(video.embed_url) : null
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
      <div className={cn(
        'w-full aspect-video rounded-xl mb-3 flex items-center justify-center relative overflow-hidden',
        hasVideo ? 'bg-gray-900' : 'bg-gray-100 dark:bg-gray-800'
      )}>
        {hasVideo ? (
          <>
            {thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-60 transition-opacity" />
            )}
            <PlayCircle className="relative z-10 w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-150" />
            {isWatched && (
              <div className="absolute top-2 right-2 z-10 bg-green-500 rounded-full p-0.5">
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
      <div className="space-y-1">
        <p className={cn('text-sm font-semibold leading-snug', hasVideo ? 'text-gray-900' : 'text-gray-500')}>
          {video.title}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{video.description}</p>
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

function getThumbnail(url: string): string | null {
  try {
    const u = new URL(url)
    // YouTube watch?v=ID
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://img.youtube.com/vi/${u.searchParams.get('v')}/mqdefault.jpg`
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return `https://img.youtube.com/vi${u.pathname}/mqdefault.jpg`
    }
    // Loom share or embed: extract ID
    const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)
    if (loomMatch) {
      return `https://cdn.loom.com/sessions/thumbnails/${loomMatch[1]}/thumbnail.gif`
    }
  } catch {}
  return null
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url)
    // Loom: /share/ID → /embed/ID
    if (u.hostname.includes('loom.com')) {
      return url.replace('/share/', '/embed/')
    }
    // YouTube watch?v=ID → /embed/ID
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    // youtu.be/ID → /embed/ID
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`
    }
  } catch {}
  return url
}

function VideoModal({ video, onClose }: { video: TrainingVideo; onClose: () => void }) {
  const embedSrc = toEmbedUrl(video.embed_url)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">{video.category}</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{video.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={video.embed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={embedSrc}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">{video.description}</p>
        </div>
      </div>
    </div>
  )
}
