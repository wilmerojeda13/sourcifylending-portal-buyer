'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { t } from '@/lib/i18n'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { locale } = useLanguage()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'
  const text = (key: string, fallback: string) => t(locale, key, fallback)

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-300 transition-colors"
      title={isDark ? text('portal.switchToLightMode', 'Switch to Light Mode') : text('portal.switchToDarkMode', 'Switch to Dark Mode')}
    >
      {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
      <span>{isDark ? text('portal.themeLight', 'Light Mode') : text('portal.themeDark', 'Dark Mode')}</span>
    </button>
  )
}
