import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import LoginForm from './LoginForm'
import { createClient } from '@/lib/supabase/server'
import { normalizeNextPath, isAdminSubdomain } from '@/lib/auth-routing'
import { localizeHref, normalizeLocale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ error?: string; email?: string; next?: string; code?: string; sl_locale?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, email, next, code, sl_locale } = await searchParams
  const headersList = await headers()
  const locale = normalizeLocale(sl_locale ?? headersList.get('x-sl-locale'))
  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  // Redirect admin subdomain to dedicated admin login
  const host = headersList.get('host')?.toLowerCase() ?? ''
  if (isAdminSubdomain(host)) {
    redirect(`/admin-login?${new URLSearchParams({ ...(error && { error }), ...(email && { email }), ...(next && { next }), ...(code && { code }) }).toString()}`)
  }

  const nextPath = normalizeNextPath(next)

  if (code) {
    const localeQuery = sl_locale ? `&sl_locale=${encodeURIComponent(sl_locale)}` : ''
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(nextPath)}${localeQuery}`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect(localizeHref(nextPath, locale))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">SL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{text('Sign In', 'Ingresar')}</h1>
          <p className="text-gray-500 text-sm mt-1">{text('Access your SourcifyLending portal', 'Accede a tu portal de SourcifyLending')}</p>
        </div>

        {error === 'account_exists' && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">{text('Account already exists', 'La cuenta ya existe')}</p>
            <p>
              {email ? `${email} ${text('has', 'tiene')}` : text('This email has', 'Este correo tiene')} {text('a portal account set up by SourcifyLending.', 'una cuenta de portal configurada por SourcifyLending.')}
              {text(' Please sign in with your ', ' Inicia sesión con tu ')}<strong>{text('email and password', 'correo y contraseña')}</strong>{text(' below.', ' abajo.')}
              {text("If you haven't set a password yet, check your email for the invite link or contact support.", 'Si aún no has creado una contraseña, revisa tu correo para ver el enlace de invitación o contacta soporte.')}
            </p>
          </div>
        )}

        {error === 'oauth_callback_failed' && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <p className="font-semibold mb-1">{text('Google sign-in could not finish', 'El inicio de sesión con Google no pudo completarse')}</p>
            <p>{text('The callback did not complete. Please try again.', 'La devolución de llamada no se completó. Inténtalo de nuevo.')}</p>
          </div>
        )}

        <LoginForm nextPath={nextPath} />

        <Link href={localizeHref('/', locale)} className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600" prefetch={false}>
          <ArrowLeft size={14} /> {text('Back to home', 'Volver al inicio')}
        </Link>
      </div>
    </div>
  )
}
