'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Upload, FileSpreadsheet, X, CheckCircle2,
  AlertCircle, Loader2, Info, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type CRMField = 'full_name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'business_name' |
                'stage' | 'program_interest' | 'source' | 'notes' | '__skip__'

interface FieldDef {
  key: CRMField
  label: string
  required?: boolean
  hint?: string
}

const CRM_FIELDS: FieldDef[] = [
  { key: '__skip__',        label: '— Skip this column —' },
  { key: 'full_name',      label: 'Full Name (auto-split)', hint: 'First + last split automatically' },
  { key: 'first_name',     label: 'First Name',       required: true },
  { key: 'last_name',      label: 'Last Name' },
  { key: 'phone',          label: 'Phone',            required: true },
  { key: 'email',          label: 'Email' },
  { key: 'business_name',  label: 'Business Name' },
  { key: 'stage',          label: 'Stage',            hint: 'new / contacted / qualified / demo_scheduled / closed_won / closed_lost' },
  { key: 'program_interest',label: 'Program Interest', hint: 'program_a / program_b / program_c' },
  { key: 'source',         label: 'Source',           hint: 'manual / facebook / purchased / referral / inbound / other' },
  { key: 'notes',          label: 'Notes' },
]

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

// ─── Auto-map column names to CRM fields ─────────────────────────────────────
function autoMap(headers: string[]): Record<number, CRMField> {
  const mapping: Record<number, CRMField> = {}
  const patterns: [RegExp, CRMField][] = [
    [/contact.?name|full.?name/i,         'full_name'],
    [/first.?name|fname|given/i,          'first_name'],
    [/last.?name|lname|surname/i,         'last_name'],
    [/^name$/i,                           'full_name'],
    [/phone|mobile|cell|tel/i,            'phone'],
    [/email|e-mail/i,                     'email'],
    [/business|company|org|biz/i,         'business_name'],
    [/stage|status|pipeline/i,            'stage'],
    [/program|interest|product/i,         'program_interest'],
    [/source|lead.?source|channel/i,      'source'],
    [/note|comment|description/i,         'notes'],
  ]
  // Track which CRM fields are already mapped (allow only one mapping per field, except skip)
  const used = new Set<CRMField>()
  headers.forEach((h, i) => {
    for (const [re, field] of patterns) {
      if (re.test(h) && !used.has(field)) {
        mapping[i] = field
        used.add(field)
        return
      }
    }
    mapping[i] = '__skip__'
  })
  return mapping
}

// ─── Result Summary ───────────────────────────────────────────────────────────
interface ImportResult {
  inserted: number
  skipped: number
  skipped_samples: string[]
  invalid: number
  invalid_samples: string[]
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]   = useState(false)
  const [headers, setHeaders]     = useState<string[]>([])
  const [rows, setRows]           = useState<string[][]>([])
  const [mapping, setMapping]     = useState<Record<number, CRMField>>({})
  const [fileName, setFileName]   = useState('')
  const [step, setStep]           = useState<'upload' | 'map' | 'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<ImportResult | null>(null)
  const [progress, setProgress]   = useState(0)

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) { toast.error('Please upload a CSV file'); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (!h.length) { toast.error('CSV appears empty'); return }
      setHeaders(h)
      setRows(r)
      setMapping(autoMap(h))
      setStep('map')
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  function setMap(colIdx: number, field: CRMField) {
    setMapping(p => {
      // Clear other columns mapped to same field (except __skip__)
      if (field !== '__skip__') {
        const next = { ...p }
        Object.keys(next).forEach(k => {
          if (parseInt(k) !== colIdx && next[parseInt(k)] === field) next[parseInt(k)] = '__skip__'
        })
        next[colIdx] = field
        return next
      }
      return { ...p, [colIdx]: field }
    })
  }

  const mappedFields = Object.values(mapping).filter(f => f !== '__skip__')
  const hasFirst = mappedFields.includes('first_name') || mappedFields.includes('full_name')
  const hasPhone = mappedFields.includes('phone')
  const canImport = hasFirst && hasPhone

  async function runImport() {
    setImporting(true)
    setProgress(0)

    // Build lead objects from rows using mapping
    const leads = rows
      .filter(row => row.some(cell => cell.trim()))
      .map(row => {
        const lead: Record<string, string> = {}
        headers.forEach((_, i) => {
          const field = mapping[i]
          if (!field || field === '__skip__') return
          if (field === 'full_name') {
            // Split "First Last" → first_name + last_name
            const full = (row[i] ?? '').trim()
            const spaceIdx = full.indexOf(' ')
            if (spaceIdx === -1) {
              lead['first_name'] = full
              lead['last_name']  = ''
            } else {
              lead['first_name'] = full.slice(0, spaceIdx)
              lead['last_name']  = full.slice(spaceIdx + 1)
            }
          } else {
            lead[field] = row[i] ?? ''
          }
        })
        return lead
      })

    // Split into chunks of 500 for progress display
    const CHUNK = 500
    let totalInserted = 0, totalSkipped = 0, totalInvalid = 0
    const skippedSamples: string[] = [], invalidSamples: string[] = []

    for (let i = 0; i < leads.length; i += CHUNK) {
      const chunk = leads.slice(i, i + CHUNK)
      try {
        const res = await fetch('/api/admin/crm/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: chunk }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast.error(json.error ?? 'Import failed')
          setImporting(false)
          return
        }
        totalInserted += json.inserted ?? 0
        totalSkipped  += json.skipped ?? 0
        totalInvalid  += json.invalid ?? 0
        if (json.skipped_samples) skippedSamples.push(...json.skipped_samples)
        if (json.invalid_samples) invalidSamples.push(...json.invalid_samples)
        setProgress(Math.round(((i + chunk.length) / leads.length) * 100))
      } catch {
        toast.error('Network error during import')
        setImporting(false)
        return
      }
    }

    setResult({ inserted: totalInserted, skipped: totalSkipped, skipped_samples: skippedSamples.slice(0,5), invalid: totalInvalid, invalid_samples: invalidSamples.slice(0,5) })
    setStep('done')
    setImporting(false)
  }

  function reset() {
    setStep('upload'); setHeaders([]); setRows([]); setMapping({})
    setFileName(''); setResult(null); setProgress(0)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/dialer" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
          <ChevronLeft size={14} /> Back to Dialer
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet size={22} className="text-orange-600" /> Import to Dialer (Raw Leads)
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Imports go to Dialer raw leads only. Promote qualified leads to CRM after calling. Duplicates are skipped automatically.
        </p>
      </div>

      {/* CSV guidance */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold">CSV import tips:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
            <li>Export your leads as a standard CSV file from your current source</li>
            <li>Make sure name and phone columns are included</li>
            <li>Imports go to Dialer raw leads (not CRM directly)</li>
            <li>Promote qualified leads to CRM after disposition</li>
          </ol>
        </div>
      </div>

      {/* Step 1 — Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all',
            dragging
              ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          )}
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="font-semibold text-gray-700">Drop your CSV here or click to browse</p>
          <p className="text-sm text-gray-400 mt-1">Supports standard CSV exports from Excel, Google Sheets, and other lead sources</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
        </div>
      )}

      {/* Step 2 — Column Mapping */}
      {step === 'map' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{fileName}</p>
              <p className="text-sm text-gray-500">{rows.length.toLocaleString()} rows · {headers.length} columns detected</p>
            </div>
            <button onClick={reset} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
              <X size={13} /> Change File
            </button>
          </div>

          {/* Column mapping table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Map Columns to Dialer Fields</p>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {headers.map((header, i) => {
                const preview = rows.slice(0, 3).map(r => r[i] ?? '').filter(Boolean).join(', ')
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-48 shrink-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{header}</p>
                      {preview && <p className="text-xs text-gray-400 truncate mt-0.5">{preview}</p>}
                    </div>
                    <span className="text-gray-300">→</span>
                    <select
                      className="input-field flex-1 text-sm"
                      value={mapping[i] ?? '__skip__'}
                      onChange={e => setMap(i, e.target.value as CRMField)}
                    >
                      {CRM_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                    {mapping[i] && mapping[i] !== '__skip__' && (
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Validation warnings */}
          {!canImport && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle size={15} />
              {!hasFirst && !hasPhone
                ? 'Map at least First Name and Phone to continue.'
                : !hasFirst
                ? 'Map the First Name column to continue.'
                : 'Map the Phone column to continue.'}
            </div>
          )}

          {/* Preview */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Preview (first 5 rows)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className={cn('px-3 py-2 text-left font-semibold truncate max-w-[140px]', mapping[i] === '__skip__' ? 'text-gray-300' : 'text-gray-600')}>
                        {h}
                        {mapping[i] && mapping[i] !== '__skip__' && (
                          <span className="ml-1 text-teal-500 font-normal">({CRM_FIELDS.find(f => f.key === mapping[i])?.label})</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="border-t border-gray-50 dark:border-gray-800">
                      {headers.map((_, ci) => (
                        <td key={ci} className={cn('px-3 py-2 truncate max-w-[140px]', mapping[ci] === '__skip__' ? 'text-gray-300' : 'text-gray-700')}>
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <div className="flex items-center gap-3">
            <button
              onClick={runImport}
              disabled={!canImport || importing}
              className="btn-primary px-6 py-3 flex items-center gap-2"
            >
              {importing
                ? <><Loader2 size={15} className="animate-spin" /> Importing... {progress}%</>
                : <><Upload size={15} /> Import {rows.length.toLocaleString()} Leads</>}
            </button>
            <button onClick={reset} className="btn-secondary px-5 py-3">Cancel</button>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
              <div
                className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Done */}
      {step === 'done' && result && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={28} className="text-green-500" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Import Complete</h2>
                <p className="text-sm text-gray-500">Your leads have been added to the CRM pipeline.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{result.inserted.toLocaleString()}</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-medium">Imported</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-amber-600">{result.skipped.toLocaleString()}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">Skipped (duplicates)</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-500">{result.invalid.toLocaleString()}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">Invalid (missing data)</p>
              </div>
            </div>

            {result.skipped_samples.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Sample duplicates skipped:</p>
                <ul className="text-xs text-gray-400 space-y-0.5">
                  {result.skipped_samples.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
            {result.invalid_samples.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Sample invalid rows:</p>
                <ul className="text-xs text-gray-400 space-y-0.5">
                  {result.invalid_samples.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Link href="/admin/crm" className="btn-primary px-6 py-3">
              View CRM Pipeline
            </Link>
            <button onClick={reset} className="btn-secondary px-5 py-3 flex items-center gap-2">
              <RefreshCw size={14} /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
