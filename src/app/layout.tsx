export const dynamic = 'force-dynamic'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import NotificationRuntime from '@/components/notifications/NotificationRuntime'
import { SITE_URL } from '@/lib/site-config'
import { SpeedInsights } from '@vercel/speed-insights/next'

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
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
          <NotificationRuntime />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '12px',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
              },
            }}
          />
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
