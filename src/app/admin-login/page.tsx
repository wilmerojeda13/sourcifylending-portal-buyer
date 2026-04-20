import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import AdminLoginForm from './AdminLoginForm'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeNextPath, ADMIN_POST_LOGIN_PATH } from '@/lib/auth-routing'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ error?: string; email?: string; next?: string; code?: string }>
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { error, email, next, code } = await searchParams
  const nextPath = normalizeNextPath(next, ADMIN_POST_LOGIN_PATH)

  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(nextPath)}&adminEntry=true`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const svc = await createServiceClient()
    const { data: profile } = await svc.from('profiles').select('is_admin').eq('id', user.id).single()

    if (profile?.is_admin) {
      redirect('/admin')
    } else {
      await supabase.auth.signOut()
      redirect(`/admin-login?error=not_admin&email=${encodeURIComponent(user.email || '')}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-white" size={24} />
          </div>
          <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
          <p className="text-gray-400 text-sm mt-1">Restricted access for admins only</p>
        </div>

        {error === 'not_admin' && (
          <div className="mb-5 bg-red-900/20 border border-red-700 rounded-xl p-4 text-sm text-red-200">
            <p className="font-semibold mb-1">Access Denied</p>
            <p>
              Your account does not have admin privileges. If you believe this is an error, contact support.
            </p>
          </div>
        )}

        {error === 'account_exists' && (
          <div className="mb-5 bg-amber-900/20 border border-amber-700 rounded-xl p-4 text-sm text-amber-200">
            <p className="font-semibold mb-1">Account already exists</p>
            <p>
              {email ? `${email} has` : 'This email has'} a portal account. Please sign in below.
            </p>
          </div>
        )}

        {error === 'oauth_callback_failed' && (
          <div className="mb-5 bg-red-900/20 border border-red-700 rounded-xl p-4 text-sm text-red-200">
            <p className="font-semibold mb-1">Sign-in could not finish</p>
            <p>The callback did not complete. Please try again.</p>
          </div>
        )}

        <AdminLoginForm nextPath={nextPath} />

        <Link href="https://www.sourcifylending.com" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-300">
          <ArrowLeft size={14} /> Back to main site
        </Link>
      </div>
    </div>
  )
}
