import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, Clock, PhoneCall } from 'lucide-react'

export const metadata = { title: 'Dialer Callbacks' }

export default async function DialerCallbacksPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')
  
  // Fetch raw leads with callbacks
  const { data: callbacks } = await supabase
    .from('dialer_raw_leads')
    .select('*')
    .is('promoted_to_crm_lead_id', null)
    .not('callback_due_at', 'is', null)
    .order('callback_due_at', { ascending: true })
    .limit(100)
  
  const now = new Date()
  const dueCallbacks = (callbacks || []).filter(l => new Date(l.callback_due_at) <= now)
  const upcomingCallbacks = (callbacks || []).filter(l => new Date(l.callback_due_at) > now)
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <Link href="/admin/dialer" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
            <ChevronLeft size={14} /> Back to Dialer
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Callbacks</h1>
              <p className="text-sm text-gray-500 mt-1">
                Raw leads with scheduled callbacks. Promote to CRM after successful contact.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {dueCallbacks.length === 0 && upcomingCallbacks.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Clock size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="font-semibold text-gray-900 mb-1">No callbacks scheduled</h3>
            <p className="text-sm text-gray-500">Set callbacks when dispositoning leads to schedule follow-ups.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dueCallbacks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
                  <Clock size={16} /> Due Now ({dueCallbacks.length})
                </h2>
                <div className="grid gap-3">
                  {dueCallbacks.map(lead => (
                    <div key={lead.id} className="bg-white rounded-xl border border-red-200 p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</p>
                        <p className="text-sm text-gray-500">{lead.phone}</p>
                        {lead.notes && <p className="text-xs text-gray-400 mt-1">{lead.notes}</p>}
                      </div>
                      <a 
                        href={`/admin/dialer/queue?lead=${lead.id}`}
                        className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 flex items-center gap-2"
                      >
                        <PhoneCall size={16} /> Call Now
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {upcomingCallbacks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-amber-600 mb-3 flex items-center gap-2">
                  <Clock size={16} /> Upcoming ({upcomingCallbacks.length})
                </h2>
                <div className="grid gap-3">
                  {upcomingCallbacks.map(lead => (
                    <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between opacity-75">
                      <div>
                        <p className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</p>
                        <p className="text-sm text-gray-500">{lead.phone}</p>
                        <p className="text-xs text-amber-600 mt-1">
                          Due: {new Date(lead.callback_due_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
