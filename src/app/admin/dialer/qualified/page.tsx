import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, CheckCircle2, ArrowUpRight } from 'lucide-react'

export const metadata = { title: 'Ready to Promote — Dialer' }

export default async function DialerQualifiedPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')
  
  const supabase = await createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')
  
  // Fetch raw leads that are qualified/ready to promote
  // These are leads with positive dispositions but not yet promoted
  const { data: qualified } = await supabase
    .from('dialer_raw_leads')
    .select('*')
    .is('promoted_to_crm_lead_id', null)
    .or('last_call_outcome.eq.interested,last_call_outcome.eq.appointment_set,last_call_outcome.eq.booked_call')
    .order('last_call_at', { ascending: false })
    .limit(100)
  
  const { data: promoted } = await supabase
    .from('dialer_raw_leads')
    .select('*')
    .not('promoted_to_crm_lead_id', 'is', null)
    .order('promoted_to_crm_at', { ascending: false })
    .limit(50)
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <Link href="/admin/dialer" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
            <ChevronLeft size={14} /> Back to Dialer
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ready to Promote</h1>
              <p className="text-sm text-gray-500 mt-1">
                Qualified raw leads and recently promoted leads.
              </p>
            </div>
            <a
              href="/admin/crm"
              className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open CRM <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        {/* Ready to Promote */}
        <div>
          <h2 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} /> Qualified & Ready ({qualified?.length || 0})
          </h2>
          
          {qualified && qualified.length > 0 ? (
            <div className="grid gap-3">
              {qualified.map(lead => (
                <div key={lead.id} className="bg-white rounded-xl border border-green-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</p>
                    <p className="text-sm text-gray-500">{lead.phone}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                        {lead.last_call_outcome}
                      </span>
                      {lead.business_name && (
                        <span className="text-xs text-gray-400">{lead.business_name}</span>
                      )}
                    </div>
                  </div>
                  <form action={`/api/admin/crm/dialer/promote`} method="POST" className="flex items-center gap-2">
                    <input type="hidden" name="raw_lead_id" value={lead.id} />
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <ArrowUpRight size={16} /> Promote to CRM
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-500">No qualified leads ready to promote.</p>
              <p className="text-xs text-gray-400 mt-1">
                Use positive dispositions (Interested, Appointment Set, Booked Call) during calls.
              </p>
            </div>
          )}
        </div>
        
        {/* Recently Promoted */}
        {promoted && promoted.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-600 mb-3">Recently Promoted ({promoted.length})</h2>
            <div className="grid gap-3">
              {promoted.slice(0, 10).map(lead => (
                <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4 opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</p>
                      <p className="text-sm text-gray-500">{lead.phone}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
                      In CRM
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
