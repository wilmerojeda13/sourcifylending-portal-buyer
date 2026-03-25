import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LoginForm from './LoginForm'

interface PageProps {
  searchParams: Promise<{ error?: string; email?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, email } = await searchParams

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">SL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign In</h1>
          <p className="text-gray-500 text-sm mt-1">Access your SourcifyLending portal</p>
        </div>

        {error === 'account_exists' && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Account already exists</p>
            <p>
              {email ? `${email} has` : 'This email has'} a portal account set up by SourcifyLending.
              Please sign in with your <strong>email and password</strong> below.
              If you haven&apos;t set a password yet, check your email for the invite link or contact support.
            </p>
          </div>
        )}

        <LoginForm />

        <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} /> Back to home
        </Link>
      </div>
    </div>
  )
}
