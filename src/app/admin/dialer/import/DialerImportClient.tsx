'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Upload, FileSpreadsheet, X, CheckCircle2,
  AlertCircle, Loader2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

type ImportField = 'full_name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'business_name' | 'notes' | 'source' | '__skip__'

interface FieldDef {
  key: ImportField
  label: string
  required?: boolean
  hint?: string
}

const IMPORT_FIELDS: FieldDef[] = [
  { key: '__skip__',        label: '— Skip this column —' },
  { key: 'full_name',      label: 'Full Name (auto-split)', hint: 'First + last split automatically' },
  { key: 'first_name',     label: 'First Name',       required: true },
  { key: 'last_name',      label: 'Last Name' },
  { key: 'phone',          label: 'Phone',            required: true },
  { key: 'email',          label: 'Email' },
  { key: 'business_name',  label: 'Business Name' },
  { key: 'source',         label: 'Source',           hint: 'manual / facebook / purchased / referral / inbound / other' },
  { key: 'notes',          label: 'Notes' },
]

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

function autoMap(headers: string[]): Record<number, ImportField> {
  const mapping: Record<number, ImportField> = {}
  const patterns: [RegExp, ImportField][] = [
    [/contact.?name|full.?name/i,         'full_name'],
    [/first.?name|fname|given/i,          'first_name'],
    [/last.?name|lname|surname/i,         'last_name'],
    [/^name$/i,                           'full_name'],
    [/phone|mobile|cell|tel/i,            'phone'],
    [/email|e-mail/i,                     'email'],
    [/business|company|org|biz/i,         'business_name'],
    [/source|lead.?source|channel/i,      'source'],
    [/note|comment|description/i,         'notes'],
  ]
  const used = new Set<ImportField>()
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

interface ImportResult {
  inserted: number
  skipped: number
  skipped_samples: string[]
  invalid: number
  invalid_samples: string[]
}

export default function DialerImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]   = useState(false)
  const [headers, setHeaders]     = useState<string[]>([])
  const [rows, setRows]           = useState<string[][]>([])
  const [mapping, setMapping]     = useState<Record<number, ImportField>>({})
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

  function setMap(colIdx: number, field: ImportField) {
    setMapping(p => {
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

    const leads = rows
      .filter(row => row.some(cell => cell.trim()))
      .map(row => {
        const lead: Record<string, string> = {}
        headers.forEach((_, i) => {
          const field = mapping[i]
          if (!field || field === '__skip__') return
          if (field === 'full_name') {
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
        const data = await res.json()
        if (res.ok) {
          totalInserted += data.inserted || 0
          totalSkipped += data.skipped || 0
          totalInvalid += data.invalid || 0
          if (data.skipped_samples) skippedSamples.push(...data.skipped_samples)
          if (data.invalid_samples) invalidSamples.push(...data.invalid_samples)
        } else {
          toast.error(data.error || 'Import error')
        }
      } catch {
        toast.error('Network error during import')
      }
      setProgress(Math.min(100, Math.round(((i + CHUNK) / leads.length) * 100)))
    }

    setResult({
      inserted: totalInserted,
      skipped: totalSkipped,
      skipped_samples: skippedSamples.slice(0, 5),
      invalid: totalInvalid,
      invalid_samples: invalidSamples.slice(0, 5),
    })
    setImporting(false)
    setStep('done')
    toast.success(`Imported ${totalInserted} leads to dialer`)
  }

  function reset() {
    setStep('upload'); setHeaders([]); setRows([]); setMapping({})
    setFileName(''); setResult(null); setProgress(0)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/admin" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ChevronLeft size={14} /> Back to Admin
            </Link>
            <Link href="/admin/dialer" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ChevronLeft size={14} /> Back to Dialer
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={22} className="text-orange-600" /> Import Raw Leads to Dialer
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Imports go to <strong>dialer raw leads only</strong>. Promote qualified leads to CRM after calling.
          </p>
        </div>

        {/* CSV guidance */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 space-y-1">
            <p className="font-semibold">Import rules:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
              <li>Upload CSV with name and phone columns</li>
              <li>Imports go to <strong>dialer raw leads</strong> (not CRM directly)</li>
              <li>Call leads first, then promote qualified ones to CRM</li>
              <li>Duplicates are skipped automatically</li>
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
                ? 'border-orange-400 bg-orange-50'
                : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
            )}
          >
            <Upload size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="font-semibold text-gray-700">Drop your CSV here or click to browse</p>
            <p className="text-sm text-gray-400 mt-1">Standard CSV exports from Excel, Google Sheets, etc.</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
          </div>
        )}

        {/* Step 2 — Column Mapping */}
        {step === 'map' && (
          <div className="space-y-5 bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{fileName}</p>
                <p className="text-sm text-gray-500">{rows.length.toLocaleString()} rows · {headers.length} columns</p>
              </div>
              <button onClick={reset} className="text-xs px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
                <X size={13} /> Change File
              </button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase">Map Columns to Dialer Fields</p>
              </div>
              <div className="divide-y">
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
                        className="flex-1 text-sm border rounded-lg px-3 py-2"
                        value={mapping[i] ?? '__skip__'}
                        onChange={e => setMap(i, e.target.value as ImportField)}
                      >
                        {IMPORT_FIELDS.map(f => (
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

            {!canImport && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle size={15} />
                Map at least First Name and Phone to continue.
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={runImport}
                disabled={!canImport || importing}
                className={cn(
                  'px-5 py-2.5 rounded-lg font-medium text-white transition-all',
                  canImport && !importing
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-gray-300 cursor-not-allowed'
                )}
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Importing... {progress}%
                  </span>
                ) : (
                  <>Import to Dialer</>
                )}
              </button>
              <button onClick={reset} className="px-5 py-2.5 border rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 'done' && result && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={20} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Import Complete</h3>
                <p className="text-sm text-gray-500">Raw leads added to dialer</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{result.inserted}</div>
                <div className="text-xs text-green-600">Imported</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{result.skipped}</div>
                <div className="text-xs text-amber-600">Duplicates Skipped</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{result.invalid}</div>
                <div className="text-xs text-red-600">Invalid</div>
              </div>
            </div>

            {result.skipped_samples.length > 0 && (
              <div className="text-sm">
                <p className="font-medium text-gray-700 mb-1">Skipped (duplicates):</p>
                <ul className="text-gray-500 space-y-0.5">
                  {result.skipped_samples.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Link href="/admin/dialer" className="px-5 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700">
                Go to Dialer
              </Link>
              <button onClick={reset} className="px-5 py-2.5 border rounded-lg hover:bg-gray-50">
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
