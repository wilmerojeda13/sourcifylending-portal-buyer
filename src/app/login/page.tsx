import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LoginForm from './LoginForm'

export default function LoginPage() {
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

        <Suspense fallback={<div className="card shadow-sm p-8 text-center text-gray-400">Loading…</div>}>
          <LoginForm />
        </Suspense>

        <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} /> Back to home
        </Link>
      </div>
    </div>
  )
}
