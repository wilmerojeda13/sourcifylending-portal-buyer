'use client'

import { useState } from 'react'
import { Search, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { checkDialerEligibility, applyDispositionEligibilityUpdates, getExclusionReasonText } from '@/lib/crm-dialer-eligibility'

interface LeadEligibilityAdminProps {
  className?: string
}

interface LeadWithEligibility {
  id: string
  first_name: string
  last_name: string
  phone: string
  business_name?: string | null
  email?: string | null
  stage: string
  last_call_outcome?: string | null
  last_call_at?: string | null
  do_not_call: boolean
  is_archived: boolean
  callback_due_at?: string | null
  follow_up_at?: string | null
  eligibility: {
    is_eligible: boolean
    exclusion_reason?: string
    exclusion_type?: string
    next_eligible_at?: string
  }
}

export default function LeadEligibilityAdmin({ className }: LeadEligibilityAdminProps) {
  const [leads, setLeads] = useState<LeadWithEligibility[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLead, setSelectedLead] = useState<LeadWithEligibility | null>(null)
  const [reactivating, setReactivating] = useState(false)
  const [showInactiveOnly, setShowInactiveOnly] = useState(true)

  // Load leads with eligibility check
  const loadLeads = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/crm/leads?limit=100')
      if (!response.ok) throw new Error('Failed to load leads')
      
      const data = await response.json()
      const leadsWithEligibility = data.leads.map((lead: any) => ({
        ...lead,
        eligibility: checkDialerEligibility(lead),
      }))

      // Filter based on showInactiveOnly setting
      const filteredLeads = showInactiveOnly 
        ? leadsWithEligibility.filter((lead: LeadWithEligibility) => !lead.eligibility.is_eligible)
        : leadsWithEligibility

      setLeads(filteredLeads)
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // Reactivate lead
  const reactivateLead = async (lead: LeadWithEligibility, action: 'remove_dnc' | 'unarchive' | 'clear_terminal') => {
    if (!confirm(`Are you sure you want to reactivate ${lead.first_name} ${lead.last_name}? This action will override the system's exclusion rules.`)) {
      return
    }

    setReactivating(true)
    try {
      const updates: any = {
        updated_at: new Date().toISOString(),
      }

      switch (action) {
        case 'remove_dnc':
          updates.do_not_call = false
          break
        case 'unarchive':
          updates.is_archived = false
          break
        case 'clear_terminal':
          updates.last_call_outcome = null
          updates.last_call_at = null
          updates.stage = 'new'
          break
      }

      const response = await fetch(`/api/admin/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to reactivate lead')
      }

      // Refresh leads
      await loadLeads()
      
      // Close modal
      setSelectedLead(null)
      
      // Show success message
      alert(`Successfully reactivated ${lead.first_name} ${lead.last_name}`)
      
    } catch (error) {
      console.error('Failed to reactivate lead:', error)
      alert(`Failed to reactivate lead: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setReactivating(false)
    }
  }

  // Filter leads by search term
  const filteredLeads = leads.filter(lead => 
    `${lead.first_name} ${lead.last_name} ${lead.phone} ${lead.business_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Initialize
  useState(() => {
    loadLeads()
  })

  return (
    <div className={cn('bg-gray-900 rounded-xl border border-gray-800 p-6', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="text-amber-500" />
          Lead Eligibility Admin
        </h3>
        <button
          onClick={loadLeads}
          disabled={loading}
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactiveOnly}
            onChange={(e) => setShowInactiveOnly(e.target.checked)}
            className="w-4 h-4"
          />
          Show inactive only
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-300">{filteredLeads.length}</div>
          <div className="text-xs text-gray-500">Total Leads</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-400">
            {filteredLeads.filter(l => !l.eligibility.is_eligible).length}
          </div>
          <div className="text-xs text-gray-500">Inactive</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {filteredLeads.filter(l => l.eligibility.is_eligible).length}
          </div>
          <div className="text-xs text-gray-500">Active</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {filteredLeads.filter(l => l.do_not_call).length}
          </div>
          <div className="text-xs text-gray-500">DNC</div>
        </div>
      </div>

      {/* Leads List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredLeads.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {loading ? 'Loading leads...' : 'No leads found'}
          </div>
        ) : (
          filteredLeads.map(lead => (
            <div
              key={lead.id}
              className={cn(
                'p-3 rounded-lg border cursor-pointer transition-colors',
                lead.eligibility.is_eligible 
                  ? 'bg-green-900/20 border-green-800/50 hover:bg-green-900/30'
                  : 'bg-red-900/20 border-red-800/50 hover:bg-red-900/30'
              )}
              onClick={() => setSelectedLead(lead)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {lead.first_name} {lead.last_name}
                  </div>
                  <div className="text-sm text-gray-400">
                    {lead.phone} {lead.business_name && `· ${lead.business_name}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Stage: {lead.stage} 
                    {lead.last_call_outcome && ` · Last: ${lead.last_call_outcome}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-3 h-3 rounded-full',
                    lead.eligibility.is_eligible ? 'bg-green-500' : 'bg-red-500'
                  )} />
                  <span className={cn(
                    'text-xs font-medium',
                    lead.eligibility.is_eligible ? 'text-green-400' : 'text-red-400'
                  )}>
                    {lead.eligibility.is_eligible ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lead Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Lead Details</h4>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1 hover:bg-gray-800 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <div className="font-medium text-white">
                  {selectedLead.first_name} {selectedLead.last_name}
                </div>
                <div className="text-sm text-gray-400">{selectedLead.phone}</div>
                {selectedLead.business_name && (
                  <div className="text-sm text-gray-400">{selectedLead.business_name}</div>
                )}
              </div>

              <div className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className={cn(
                    'font-medium',
                    selectedLead.eligibility.is_eligible ? 'text-green-400' : 'text-red-400'
                  )}>
                    {selectedLead.eligibility.is_eligible ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                {!selectedLead.eligibility.is_eligible && (
                  <div className="mt-2 p-2 bg-red-900/20 border border-red-800/50 rounded text-xs text-red-400">
                    {getExclusionReasonText(selectedLead.eligibility)}
                  </div>
                )}

                <div className="flex justify-between mt-2">
                  <span className="text-gray-400">Stage:</span>
                  <span>{selectedLead.stage}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">DNC:</span>
                  <span className={selectedLead.do_not_call ? 'text-red-400' : 'text-green-400'}>
                    {selectedLead.do_not_call ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Archived:</span>
                  <span className={selectedLead.is_archived ? 'text-red-400' : 'text-green-400'}>
                    {selectedLead.is_archived ? 'Yes' : 'No'}
                  </span>
                </div>

                {selectedLead.last_call_outcome && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Last Call:</span>
                    <span>{selectedLead.last_call_outcome}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Admin Actions */}
            {!selectedLead.eligibility.is_eligible && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-300">Admin Override Actions:</h5>
                
                {selectedLead.do_not_call && (
                  <button
                    onClick={() => reactivateLead(selectedLead, 'remove_dnc')}
                    disabled={reactivating}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Remove DNC Flag
                  </button>
                )}

                {selectedLead.is_archived && (
                  <button
                    onClick={() => reactivateLead(selectedLead, 'unarchive')}
                    disabled={reactivating}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Unarchive Lead
                  </button>
                )}

                {selectedLead.eligibility.exclusion_type === 'terminal_outcome' && (
                  <button
                    onClick={() => reactivateLead(selectedLead, 'clear_terminal')}
                    disabled={reactivating}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Clear Terminal Outcome
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
