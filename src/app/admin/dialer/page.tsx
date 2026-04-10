import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import DialerClient from '../crm/dialer/DialerClient'

export const metadata = { title: 'Power Dialer' }

export default async function DialerPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Power Dialer</h1>
            <p className="text-sm text-gray-500">Raw leads workspace. Promote qualified leads to CRM.</p>
          </div>
          <a 
            href="/admin/crm" 
            className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open CRM →
          </a>
        </div>
      </div>
      <DialerClient />
    </div>
  )
}
