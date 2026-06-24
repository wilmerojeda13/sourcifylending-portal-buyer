export const dynamic = 'force-dynamic'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import './globals.css'
import { SITE_URL } from '@/lib/site-config'
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n'
import { LanguageProvider } from '@/components/i18n/LanguageProvider'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import NotificationRuntime from '@/components/notifications/NotificationRuntime'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: {
    default: 'SourcifyLending Portal',
    template: '%s | SourcifyLending',
  },
  description: 'AI-powered business credit fulfillment platform.',
  metadataBase: new URL(SITE_URL),
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'SourcifyLending Portal',
    description: 'AI-powered business credit fulfillment platform.',
    url: SITE_URL,
    siteName: 'SourcifyLending',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SourcifyLending Portal',
    description: 'AI-powered business credit fulfillment platform.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/sourcify-favicon-20260331.png', type: 'image/png' },
    ],
    shortcut: [
      { url: '/sourcify-favicon-20260331.png', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon-20260331.png', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f8f3d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const headerStore = headers()
  const headerLocale = headerStore.get('x-sl-locale')
  const initialLocale = headerLocale ? normalizeLocale(headerLocale) : normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value)

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <LanguageProvider initialLocale={initialLocale}>
            <NotificationRuntime />
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  borderRadius: '14px',
                  padding: '12px 14px',
                },
              }}
            />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
