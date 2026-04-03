'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Phone, Save, ShieldCheck, User } from 'lucide-react'
import NotificationPreferencesCard from '@/components/notifications/NotificationPreferencesCard'

type AdminProfile = {
  full_name: string
  email: string
  phone: string
}

export default function AdminProfilePage() {
  const [form, setForm] = useState<AdminProfile>({ full_name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/profile')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load admin profile')
        setForm(data.profile)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load admin profile'))
      .finally(() => setLoading(false))
  }, [])

  async function saveProfile() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save admin profile')
      setForm(data.profile)
      setSuccess('Admin profile saved. This number will be used for the persistent Twilio rep session.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save admin profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} />
          Admin
        </Link>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dialer Profile</h1>
              <p className="mt-1 text-sm text-gray-500">
                The phone number here is the number Twilio calls when you click Ready in the CRM dialer.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <User size={12} />
                Full Name
              </label>
              <input
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Email
              </label>
              <input
                value={form.email}
                disabled
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Phone size={12} />
                Rep Phone Number
              </label>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+14845551234"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                Use a real U.S. number you will answer. It is normalized to E.164 when saved.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save Admin Profile'}
            </button>
          </div>
        </div>

        <NotificationPreferencesCard
          scope="admin"
          title="Admin Notification Settings"
          description="Manage desktop delivery for operational admin alerts. Mobile continues to use the in-app activity feed and badges."
        />
      </div>
    </div>
  )
}
