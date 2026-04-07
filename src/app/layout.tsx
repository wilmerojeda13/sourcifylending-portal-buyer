export const dynamic = 'force-dynamic'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import NotificationRuntime from '@/components/notifications/NotificationRuntime'

export const metadata: Metadata = {
  title: 'SourcifyLending Portal',
  description: 'AI-powered business credit fulfillment platform',
  manifest: '/site.webmanifest',
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
      </body>
    </html>
  )
}
