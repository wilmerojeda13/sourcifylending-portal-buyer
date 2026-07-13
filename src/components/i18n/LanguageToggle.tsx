'use client'

import { Globe } from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, toggleLocale } = useLanguage()
  const isSpanish = locale === 'es'
  const label = t(locale, 'portal.languageTitle', isSpanish ? 'Switch language' : 'Cambiar idioma')

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={cn(
        'group inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-full border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-px hover:border-emerald-200 hover:shadow-[0_14px_32px_-18px_rgba(14,116,144,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 sm:h-11 sm:gap-2.5 sm:px-3.5 sm:text-xs dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800 dark:hover:border-emerald-500/60 dark:hover:bg-slate-900',
        className,
      )}
      title={label}
      aria-label={label}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-50 to-emerald-50 text-slate-600 ring-1 ring-slate-200/80 transition-colors group-hover:text-sky-700 dark:from-slate-800 dark:to-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-7 sm:w-7">
        <Globe size={15} strokeWidth={2} />
      </span>
      <span
        aria-hidden="true"
        className="inline-flex items-center rounded-full bg-white/80 pl-0.5 text-[11px] tracking-[0.14em] sm:text-xs dark:bg-transparent"
      >
        <span
          className={cn(
            'min-w-[2.2rem] rounded-full px-2 py-1 text-center transition-colors sm:min-w-[2.4rem]',
            !isSpanish
              ? 'bg-emerald-50 text-emerald-600 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)] dark:bg-emerald-500/12 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-300',
          )}
        >
          EN
        </span>
        <span className="px-0.5 text-slate-300 dark:text-slate-600">|</span>
        <span
          className={cn(
            'min-w-[2.2rem] rounded-full px-2 py-1 text-center transition-colors sm:min-w-[2.4rem]',
            isSpanish
              ? 'bg-emerald-50 text-emerald-600 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)] dark:bg-emerald-500/12 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-300',
          )}
        >
          ES
        </span>
      </span>
    </button>
  )
}
