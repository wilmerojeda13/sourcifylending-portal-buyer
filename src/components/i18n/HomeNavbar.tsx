'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { portalSignInHref, localizeHref, t } from '@/lib/i18n'

export default function HomeNavbar() {
  const { locale } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="relative w-full border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 max-w-6xl mx-auto overflow-visible">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">SL</span>
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 truncate whitespace-nowrap">SourcifyLending</span>
        </div>

        <div className="hidden sm:flex items-center justify-end gap-3 shrink-0 ml-auto">
          <Link href={localizeHref('/partners', locale)} className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline" prefetch={false}>
            {t(locale, 'nav.partners', 'Partners')}
          </Link>
          <Link href={localizeHref('/pricing', locale)} className="brand-link text-sm font-medium px-3 py-2 whitespace-nowrap" prefetch={false}>
            {t(locale, 'nav.pricing', 'Pricing')}
          </Link>
          <Link href={portalSignInHref(locale)} className="brand-link text-sm font-medium px-3 py-2 whitespace-nowrap" prefetch={false}>
            {t(locale, 'nav.signIn', 'Sign In')}
          </Link>
          <Link href={localizeHref('/analyzer', locale)} className="btn-primary text-sm px-4 py-2.5 whitespace-nowrap shadow-sm" prefetch={false}>
            {t(locale, 'nav.freeAnalyzer', 'Free Analyzer')}
          </Link>
          <LanguageToggle className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-white px-3 py-2 text-xs font-semibold text-green-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50 hover:text-green-800 hover:shadow-md dark:border-green-800 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40" />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:hidden">
          <LanguageToggle className="inline-flex h-10 w-fit shrink-0 items-center gap-1 rounded-full border border-green-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-none text-green-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50 hover:text-green-800 hover:shadow-md dark:border-green-800 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40" />
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-green-300 hover:text-green-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-green-600 dark:hover:text-green-300"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="home-mobile-menu"
            onClick={() => setMobileMenuOpen(v => !v)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-black/20 sm:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            id="home-mobile-menu"
            className="absolute left-4 right-4 top-full z-50 mt-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl sm:hidden dark:border-gray-800 dark:bg-gray-950"
          >
            <Link
              href={localizeHref('/partners', locale)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              prefetch={false}
              onClick={() => setMobileMenuOpen(false)}
            >
              {t(locale, 'nav.partners', 'Partners')}
            </Link>
            <Link
              href={localizeHref('/pricing', locale)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              prefetch={false}
              onClick={() => setMobileMenuOpen(false)}
            >
              {t(locale, 'nav.pricing', 'Pricing')}
            </Link>
            <Link
              href={portalSignInHref(locale)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              prefetch={false}
              onClick={() => setMobileMenuOpen(false)}
            >
              {t(locale, 'nav.signIn', 'Sign In')}
            </Link>
            <Link
              href={localizeHref('/analyzer', locale)}
              className="block rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
              prefetch={false}
              onClick={() => setMobileMenuOpen(false)}
            >
              {t(locale, 'nav.freeAnalyzer', 'Free Analyzer')}
            </Link>
          </div>
        </>
      ) : null}
    </header>
  )
}
