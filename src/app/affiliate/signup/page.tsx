'use client'
import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, ArrowLeft, Send } from 'lucide-react'

export default function AffiliateSignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Open mailto with the filled details
    const subject = encodeURIComponent('Affiliate Application — SourcifyLending')
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nAbout my audience/network:\n${description}`
    )
    window.location.href = `mailto:abel@sourcifylending.com?subject=${subject}&body=${body}`
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-xl">SL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Become an Affiliate</h1>
          <p className="text-sm text-gray-500 mt-1">Partner with SourcifyLending</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Application Sent!</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Thank you for your interest! We&apos;ll review your application and reach out within
                <strong className="text-gray-700"> 2 business days</strong>.
              </p>
              <Link
                href="/affiliate/login"
                className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
              >
                <ArrowLeft size={14} />
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Request Access</h2>
              <p className="text-sm text-gray-500 mb-6">
                Affiliates are manually approved. Fill out the form and we&apos;ll be in touch.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Your name"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    About Your Audience / Network
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={4}
                    placeholder="Tell us about your audience, how you plan to promote, and any relevant experience..."
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Send size={15} />
                  Submit Application
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link
                  href="/affiliate/login"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                >
                  <ArrowLeft size={13} />
                  Already have an account? Sign in
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Info note */}
        {!submitted && (
          <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-xs text-indigo-700 leading-relaxed">
              <strong>Earn recurring commissions</strong> for every client you refer. Unlock free Program B access
              after 5 active referrals.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
