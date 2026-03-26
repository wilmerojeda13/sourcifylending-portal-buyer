'use client'

import { useEffect, useState } from 'react'
import { PlayCircle, CheckCircle, Clock, Lock, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface TrainingVideo {
  id: string
  title: string
  description: string
  duration: string
  category: string
  embed_url: string
  is_published: boolean
  sort_order: number
}

const CATEGORY_ORDER = [
  'Getting Started',
  'How to Pitch & Sell',
  'Program A — Credit Cards',
  'Program B — Business Credit',
  'Tools & Portal Walkthrough',
  'Compliance & Do\'s and Don\'ts',
]

export default function AffiliateTrainingPage() {
  const [videos, setVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [activeVideo, setActiveVideo] = useState<TrainingVideo | null>(null)
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        const key = `affiliate_training_watched_${user.id}`
        try {
          const raw = localStorage.getItem(key)
          if (raw) setWatched(new Set(JSON.parse(raw)))
        } catch {}
      }
    })

    fetch('/api/affiliate/training')
      .then(r => r.json())
      .then(d => setVideos(d.videos ?? []))
      .finally(() => setLoading(false))
  }, [])

  const markWatched = (id: string) => {
    if (!userId) return
    setWatched(prev => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(`affiliate_training_watched_${userId}`, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  const grouped = CATEGORY_ORDER.reduce<Record<string, TrainingVideo[]>>((acc, cat) => {
    const vids = videos.filter(v => v.category === cat).sort((a, b) => a.sort_order - b.sort_order)
    if (vids.length) acc[cat] = vids
    return acc
  }, {})

  const totalWatched = videos.filter(v => watched.has(v.id)).length

  return (
    <div className="space-y-8 pt-16 lg:pt-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Center</h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything you need to confidently pitch and close clients.
          </p>
        </div>
        {videos.length > 0 && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 text-sm">
            <CheckCircle className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-indigo-700">
              {totalWatched} / {videos.length} watched
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {videos.length > 0 && (
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-700"
            style={{ width: `${(totalWatched / videos.length) * 100}%` }}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-gray-200 animate-pulse aspect-[4/3]" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="text-center py-20">
          <PlayCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Training videos are coming soon. Check back shortly!</p>
        </div>
      )}

      {/* Video categories */}
      {!loading && Object.entries(grouped).map(([category, catVideos]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-2 uppercase tracking-wide">
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

      {/* Modal */}
      {activeVideo && (
        <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  )
}

function VideoCard({ video, isWatched, onClick }: { video: TrainingVideo; isWatched: boolean; onClick: () => void }) {
  const hasVideo = !!video.embed_url
  return (
    <button
      onClick={onClick}
      disabled={!hasVideo}
      className={cn(
        'group text-left rounded-2xl border p-4 transition-all duration-150',
        hasVideo
          ? 'bg-white border-gray-200 hover:shadow-md hover:border-indigo-200 cursor-pointer'
          : 'bg-gray-50 border-gray-100 cursor-default opacity-70'
      )}
    >
      <div className={cn(
        'w-full aspect-video rounded-xl mb-3 flex items-center justify-center relative overflow-hidden',
        hasVideo ? 'bg-gray-900' : 'bg-gray-100'
      )}>
        {hasVideo ? (
          <>
            <PlayCircle className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-150" />
            {isWatched && (
              <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-0.5">
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
      <p className={cn('text-sm font-semibold leading-snug', hasVideo ? 'text-gray-900' : 'text-gray-500')}>
        {video.title}
      </p>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{video.description}</p>
      <div className="flex items-center gap-2 mt-2">
        {video.duration && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />{video.duration}
          </span>
        )}
        {isWatched && hasVideo && (
          <span className="text-xs text-indigo-600 font-medium">Watched</span>
        )}
      </div>
    </button>
  )
}

function VideoModal({ video, onClose }: { video: TrainingVideo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">{video.category}</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{video.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a href={video.embed_url} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe src={video.embed_url} className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen />
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">{video.description}</p>
        </div>
      </div>
    </div>
  )
}
