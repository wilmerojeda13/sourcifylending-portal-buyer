'use client'

import { Globe } from 'lucide-react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, toggleLocale } = useLanguage()
  const isSpanish = locale === 'es'

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-green-600 dark:hover:text-green-300 ${className}`}
      title={t(locale, 'portal.languageTitle', isSpanish ? 'Switch language' : 'Cambiar idioma')}
      aria-label={t(locale, 'portal.languageTitle', isSpanish ? 'Switch language' : 'Cambiar idioma')}
    >
      <Globe size={14} />
      <span>{isSpanish ? 'ES' : 'EN'}</span>
    </button>
  )
}
