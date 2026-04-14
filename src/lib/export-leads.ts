import * as XLSX from 'xlsx'

export interface LeadExportData {
  id: string
  first_name: string
  last_name: string | null
  phone: string
  phone_e164: string | null
  email: string | null
  business_name: string | null
  notes: string | null
  industry: string | null
  do_not_call: boolean
  likely_timezone: string | null
  campaign_status: string
  last_call_outcome: string | null
  last_called_at: string | null
  callback_due_at: string | null
}

export function flattenLeadForExport(lead: any): LeadExportData {
  return {
    id: lead.id,
    first_name: lead.raw_lead?.first_name || '',
    last_name: lead.raw_lead?.last_name || '',
    phone: lead.raw_lead?.phone || '',
    phone_e164: lead.raw_lead?.phone_e164 || '',
    email: lead.raw_lead?.email || '',
    business_name: lead.raw_lead?.business_name || '',
    notes: lead.notes || '',
    industry: lead.raw_lead?.industry || '',
    do_not_call: lead.raw_lead?.do_not_call || false,
    likely_timezone: lead.raw_lead?.likely_timezone || '',
    campaign_status: lead.status || '',
    last_call_outcome: lead.last_call_outcome || '',
    last_called_at: lead.last_called_at || '',
    callback_due_at: lead.callback_due_at || '',
  }
}

export function exportToCSV(
  leads: any[],
  filename: string,
  excludeStatuses: string[] = []
) {
  // Filter leads
  const filteredLeads = leads.filter(lead => !excludeStatuses.includes(lead.status))

  // Flatten data
  const data = filteredLeads.map(lead => flattenLeadForExport(lead))

  // Create CSV content
  const headers = Object.keys(data[0] || {})
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers
        .map(header => {
          const value = (row as any)[header]
          // Escape quotes and wrap in quotes if contains comma
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value === null || value === undefined ? '' : String(value)
        })
        .join(',')
    ),
  ].join('\n')

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, filename)
}

export function exportToExcel(
  leads: any[],
  filename: string,
  excludeStatuses: string[] = []
) {
  // Filter leads
  const filteredLeads = leads.filter(lead => !excludeStatuses.includes(lead.status))

  // Flatten data
  const data = filteredLeads.map(lead => flattenLeadForExport(lead))

  // Create workbook
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')

  // Style the header row
  const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
    const address = XLSX.utils.encode_col(C) + '1'
    if (!ws[address]) continue
    ws[address].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F2937' } },
      alignment: { horizontal: 'center' },
    }
  }

  // Auto-size columns
  const colWidths = data.length > 0
    ? Object.keys(data[0]).map(key => ({
        wch: Math.max(key.length, 12),
      }))
    : []
  ws['!cols'] = colWidths

  // Download
  XLSX.writeFile(wb, filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const BAD_LEAD_STATUSES = [
  { id: 'dnc', label: 'DNC' },
  { id: 'disconnected', label: 'Disconnected' },
  { id: 'closed_lost', label: 'Not Interested' },
] as const
