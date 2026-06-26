'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LOCALE, LOCALE_COOKIE, localizePathname, normalizeLocale, type Locale } from '@/lib/i18n'

type LanguageContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function setCookie(locale: Locale) {
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${maxAge}; samesite=lax`
}

export function LanguageProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const router = useRouter()

  useEffect(() => {
    const urlLocale = new URL(window.location.href).searchParams.get(LOCALE_COOKIE)
    const saved = window.localStorage.getItem(LOCALE_COOKIE) || document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1]

    const nextLocale = urlLocale ? normalizeLocale(urlLocale) : normalizeLocale(saved)
    if (nextLocale !== locale) {
      setLocaleState(nextLocale)
    }
    document.documentElement.lang = nextLocale
    window.localStorage.setItem(LOCALE_COOKIE, nextLocale)
    setCookie(nextLocale)
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    document.documentElement.lang = nextLocale
    window.localStorage.setItem(LOCALE_COOKIE, nextLocale)
    setCookie(nextLocale)
    window.dispatchEvent(new CustomEvent('sl-locale-change', { detail: nextLocale }))
    const current = new URL(window.location.href)
    const localizedPath = localizePathname(current.pathname, nextLocale)
    current.searchParams.set('sl_locale', nextLocale)
    router.replace(`${localizedPath}${current.search}${current.hash}`, { scroll: false })
  }, [router])

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'es' : 'en')
  }, [locale, setLocale])

  const value = useMemo(() => ({ locale, setLocale, toggleLocale }), [locale, setLocale, toggleLocale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      toggleLocale: () => {},
    }
  }
  return context
}
