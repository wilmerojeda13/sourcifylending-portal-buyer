'use client'

import { useState, useEffect } from 'react'
import { PlayCircle, CheckCircle, Clock, Lock, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/components/i18n/LanguageProvider'

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

function translateTrainingCategory(locale: 'en' | 'es', category: string) {
  if (locale !== 'es') return category
  const map: Record<string, string> = {
    'Getting Started': 'Primeros pasos',
    'Program A â€” Credit Optimization': 'Programa A â€” OptimizaciÃ³n de crÃ©dito',
    'Program B â€” Business Credit': 'Programa B â€” CrÃ©dito empresarial',
    'Progress & Documents': 'Progreso y documentos',
    'Billing & Support': 'FacturaciÃ³n y soporte',
  }
  return map[category] ?? category
}

function translateTrainingVideoText(locale: 'en' | 'es', value: string) {
  if (locale !== 'es') return value

  const map: Record<string, string> = {
    'Pull personal credit reports from all 3 bureaus': 'Descarga tus reportes de crÃ©dito personal de los 3 burÃ³s',
    'Obtain your Equifax, Experian, and TransUnion reports via AnnualCreditReport.com. Review for errors, late payments, and collections.': 'ObtÃ©n tus reportes de Equifax, Experian y TransUnion mediante AnnualCreditReport.com. RevÃ­salos para detectar errores, pagos tardÃ­os y cuentas en cobranza.',
    'Dispute outdated negative items': 'Disputa elementos negativos desactualizados',
    'Submit disputes for any negative items older than 7 years or that appear inaccurate. Use certified mail or bureau portals.': 'Presenta disputas por cualquier elemento negativo de mÃ¡s de 7 aÃ±os o que parezca inexacto. Usa correo certificado o los portales de los burÃ³s.',
    'Reduce utilization to below 30% on Card 1': 'Reduce la utilizaciÃ³n por debajo del 30% en la Tarjeta 1',
    'Your primary card is currently at 47% utilization. Pay down the balance to below 30% to improve your score before the application window.': 'Tu tarjeta principal estÃ¡ actualmente al 47% de utilizaciÃ³n. Reduce el saldo por debajo del 30% para mejorar tu puntaje antes de la ventana de solicitud.',
    'Add an authorized user tradeline': 'Agrega una tradeline de usuario autorizado',
    'Identify a trusted family member or friend with a long-standing, low-utilization card. Ask to be added as an authorized user.': 'Identifica a un familiar o amigo de confianza con una tarjeta antigua y de baja utilizaciÃ³n. Pide que te agreguen como usuario autorizado.',
    'Confirm application strategy with AI agent': 'Confirma la estrategia de solicitudes con el agente de IA',
    "Review your recommended card application order with the AI agent. Understand the sequencing logic and confirm you're ready to proceed.": 'Revisa con el agente de IA el orden recomendado para tus solicitudes de tarjetas. Comprende la lÃ³gica de secuencia y confirma que estÃ¡s listo para continuar.',
    'Apply for Card Set 1 (Chase Ink + Amex Blue Business)': 'Solicita el Grupo de Tarjetas 1 (Chase Ink + Amex Blue Business)',
    'Apply for both cards on the same day to minimize the inquiry impact window. Start with Chase, then Amex within 2 hours.': 'Solicita ambas tarjetas el mismo dÃ­a para minimizar la ventana de impacto de consultas. Comienza con Chase y luego Amex dentro de 2 horas.',
    'Apply for Card Set 2 (Capital One Venture X + US Bank)': 'Solicita el Grupo de Tarjetas 2 (Capital One Venture X + US Bank)',
    'Wait 91 days after Set 1 before applying. This prevents velocity flags and keeps your profile clean for the next set.': 'Espera 91 dÃ­as despuÃ©s del Grupo 1 antes de solicitar. Esto evita alertas por velocidad y mantiene tu perfil limpio para el siguiente grupo.',
    'Request credit limit increases on Set 1 cards': 'Solicita aumentos de lÃ­mite de crÃ©dito en las tarjetas del Grupo 1',
    'After 6 months of on-time payments, call each issuer and request a credit limit increase. This lowers your utilization ratio.': 'DespuÃ©s de 6 meses de pagos puntuales, llama a cada emisor y solicita un aumento de lÃ­mite. Esto reduce tu proporciÃ³n de utilizaciÃ³n.',
    'Transfer existing balances to 0% APR cards': 'Transfiere saldos existentes a tarjetas con APR 0%',
    'Identify which of your existing high-interest balances are eligible for transfer. Move them to the 0% intro APR cards from Set 1.': 'Identifica cuÃ¡les de tus saldos actuales con alto interÃ©s son elegibles para transferencia. MuÃ©velos a las tarjetas con APR introductorio 0% del Grupo 1.',
    'Document your 0% APR repayment plan': 'Documenta tu plan de pago con APR 0%',
    'Create a month-by-month payoff schedule for each balance transfer. Upload to your document manager for tracking.': 'Crea un cronograma mensual de pago para cada transferencia de saldo. SÃºbelo a tu gestor de documentos para darle seguimiento.',
    'Generate monthly optimization report': 'Genera el reporte mensual de optimizaciÃ³n',
    'Use the AI agent to generate a monthly optimization report summarizing your progress, savings, and next steps.': 'Usa el agente de IA para generar un reporte mensual de optimizaciÃ³n que resuma tu progreso, ahorros y prÃ³ximos pasos.',
  }

  return map[value] ?? value
}

export default function TrainingClient({ userId, assignedProgram, videos }: Props) {
  const { locale } = useLanguage()
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
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  const visibleVideos = videos

  const grouped = CATEGORY_ORDER.reduce<Record<string, TrainingVideo[]>>((acc, cat) => {
    const vids = visibleVideos.filter(v => v.category === cat).sort((a, b) => a.sort_order - b.sort_order)
    if (vids.length) acc[cat] = vids
    return acc
  }, {})
  const otherVideos = visibleVideos.filter(v => !CATEGORY_ORDER.includes(v.category)).sort((a, b) => a.sort_order - b.sort_order)

  const totalWatched = visibleVideos.filter(v => watched.has(v.id)).length

  const translateCategory = (category: string) => {
    if (locale !== 'es') return category
    const map: Record<string, string> = {
      'Getting Started': 'Primeros pasos',
      'Program A — Credit Optimization': 'Programa A — Optimización de crédito',
      'Program B — Business Credit': 'Programa B — Crédito empresarial',
      'Progress & Documents': 'Progreso y documentos',
      'Billing & Support': 'Facturación y soporte',
    }
    return map[category] ?? category
  }

  const translateVideoText = (value: string) => {
    if (locale !== 'es') return value

    const map: Record<string, string> = {
      'Pull personal credit reports from all 3 bureaus': 'Descarga tus reportes de crédito personal de los 3 burós',
      'Obtain your Equifax, Experian, and TransUnion reports via AnnualCreditReport.com. Review for errors, late payments, and collections.': 'Obtén tus reportes de Equifax, Experian y TransUnion mediante AnnualCreditReport.com. Revísalos para detectar errores, pagos tardíos y cuentas en cobranza.',
      'Dispute outdated negative items': 'Disputa elementos negativos desactualizados',
      'Submit disputes for any negative items older than 7 years or that appear inaccurate. Use certified mail or bureau portals.': 'Presenta disputas por cualquier elemento negativo de más de 7 años o que parezca inexacto. Usa correo certificado o los portales de los burós.',
      'Reduce utilization to below 30% on Card 1': 'Reduce la utilización por debajo del 30% en la Tarjeta 1',
      'Your primary card is currently at 47% utilization. Pay down the balance to below 30% to improve your score before the application window.': 'Tu tarjeta principal está actualmente al 47% de utilización. Reduce el saldo por debajo del 30% para mejorar tu puntaje antes de la ventana de solicitud.',
      'Add an authorized user tradeline': 'Agrega una tradeline de usuario autorizado',
      'Identify a trusted family member or friend with a long-standing, low-utilization card. Ask to be added as an authorized user.': 'Identifica a un familiar o amigo de confianza con una tarjeta antigua y de baja utilización. Pide que te agreguen como usuario autorizado.',
      'Confirm application strategy with AI agent': 'Confirma la estrategia de solicitudes con el agente de IA',
      "Review your recommended card application order with the AI agent. Understand the sequencing logic and confirm you're ready to proceed.": 'Revisa con el agente de IA el orden recomendado para tus solicitudes de tarjetas. Comprende la lógica de secuencia y confirma que estás listo para continuar.',
      'Apply for Card Set 1 (Chase Ink + Amex Blue Business)': 'Solicita el Grupo de Tarjetas 1 (Chase Ink + Amex Blue Business)',
      'Apply for both cards on the same day to minimize the inquiry impact window. Start with Chase, then Amex within 2 hours.': 'Solicita ambas tarjetas el mismo día para minimizar la ventana de impacto de consultas. Comienza con Chase y luego Amex dentro de 2 horas.',
      'Apply for Card Set 2 (Capital One Venture X + US Bank)': 'Solicita el Grupo de Tarjetas 2 (Capital One Venture X + US Bank)',
      'Wait 91 days after Set 1 before applying. This prevents velocity flags and keeps your profile clean for the next set.': 'Espera 91 días después del Grupo 1 antes de solicitar. Esto evita alertas por velocidad y mantiene tu perfil limpio para el siguiente grupo.',
      'Request credit limit increases on Set 1 cards': 'Solicita aumentos de límite de crédito en las tarjetas del Grupo 1',
      'After 6 months of on-time payments, call each issuer and request a credit limit increase. This lowers your utilization ratio.': 'Después de 6 meses de pagos puntuales, llama a cada emisor y solicita un aumento de límite. Esto reduce tu proporción de utilización.',
      'Transfer existing balances to 0% APR cards': 'Transfiere saldos existentes a tarjetas con APR 0%',
      'Identify which of your existing high-interest balances are eligible for transfer. Move them to the 0% intro APR cards from Set 1.': 'Identifica cuáles de tus saldos actuales con alto interés son elegibles para transferencia. Muévelos a las tarjetas con APR introductorio 0% del Grupo 1.',
      'Document your 0% APR repayment plan': 'Documenta tu plan de pago con APR 0%',
      'Create a month-by-month payoff schedule for each balance transfer. Upload to your document manager for tracking.': 'Crea un cronograma mensual de pago para cada transferencia de saldo. Súbelo a tu gestor de documentos para darle seguimiento.',
      'Generate monthly optimization report': 'Genera el reporte mensual de optimización',
      'Use the AI agent to generate a monthly optimization report summarizing your progress, savings, and next steps.': 'Usa el agente de IA para generar un reporte mensual de optimización que resuma tu progreso, ahorros y próximos pasos.',
    }

    return map[value] ?? value
  }

  if (visibleVideos.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{locale === 'es' ? 'Centro de entrenamiento' : 'Training Center'}</h1>
        <div className="mt-16 text-center text-gray-400">
          <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {locale === 'es' ? 'Los videos de entrenamiento llegarán pronto. ¡Vuelve en breve!' : 'Training videos are coming soon. Check back shortly!'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{locale === 'es' ? 'Centro de entrenamiento' : 'Training Center'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {locale === 'es'
              ? 'Videos paso a paso para ayudarte a sacar el máximo provecho de tu programa.'
              : 'Step-by-step videos to help you get the most out of your program.'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5 text-sm">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-green-700 dark:text-green-400">
            {totalWatched} / {visibleVideos.length} {locale === 'es' ? 'vistos' : 'watched'}
          </span>
        </div>
      </div>

      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full progress-bar-fill"
          style={{ width: `${visibleVideos.length ? (totalWatched / visibleVideos.length) * 100 : 0}%` }}
        />
      </div>

      {Object.entries(grouped).map(([category, catVideos]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 dark:border-gray-800 pb-2">
            {translateTrainingCategory(locale, category)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catVideos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isWatched={watched.has(video.id)}
                locale={locale}
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

      {otherVideos.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 dark:border-gray-800 pb-2">
            {locale === 'es' ? 'Otro entrenamiento' : 'Other Training'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherVideos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isWatched={watched.has(video.id)}
                locale={locale}
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
      )}

      {activeVideo && (
        <VideoModal video={activeVideo} locale={locale} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  )
}

function VideoCard({ video, isWatched, locale, onClick }: { video: TrainingVideo; isWatched: boolean; locale: 'en' | 'es'; onClick: () => void }) {
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
            <span className="text-xs font-medium">{locale === 'es' ? 'Próximamente' : 'Coming Soon'}</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <p className={cn('text-sm font-semibold leading-snug', hasVideo ? 'text-gray-900' : 'text-gray-500')}>
          {translateTrainingVideoText(locale, video.title)}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{translateTrainingVideoText(locale, video.description)}</p>
        <div className="flex items-center gap-2 pt-1">
          {video.duration && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {video.duration}
            </span>
          )}
          {isWatched && hasVideo && (
            <span className="text-xs text-green-600 font-medium">{locale === 'es' ? 'Visto' : 'Watched'}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function getThumbnail(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://img.youtube.com/vi/${u.searchParams.get('v')}/mqdefault.jpg`
    }
    if (u.hostname === 'youtu.be') {
      return `https://img.youtube.com/vi${u.pathname}/mqdefault.jpg`
    }
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
    if (u.hostname.includes('loom.com')) {
      return url.replace('/share/', '/embed/')
    }
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`
    }
  } catch {}
  return url
}

function VideoModal({ video, locale, onClose }: { video: TrainingVideo; locale: 'en' | 'es'; onClose: () => void }) {
  const embedSrc = toEmbedUrl(video.embed_url)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">{translateTrainingCategory(locale, video.category)}</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{translateTrainingVideoText(locale, video.title)}</h3>
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
          <p className="text-sm text-gray-600">{translateTrainingVideoText(locale, video.description)}</p>
        </div>
      </div>
    </div>
  )
}
