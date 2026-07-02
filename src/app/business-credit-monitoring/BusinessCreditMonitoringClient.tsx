'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Plus, Trash2, X, Loader2, BarChart3,
  RefreshCw, Link2, AlertTriangle, CheckCircle2, Zap,
  ChevronDown, ChevronUp, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import { useBusinessContext } from '@/lib/use-business-context'

type BureauProfile = {
  duns_number: string | null
  duns_status: string
  experian_status: string
  experian_score: number | null
  equifax_status: string
  equifax_score: number | null
  nav_status: string
  nav_connection_status: string | null
  nav_last_synced_at: string | null
  paydex_score: number | null
  paydex_date: string | null
  intelliscore: number | null
  intelliscore_date: string | null
  nav_sync_history: SyncHistoryEntry[]
}

type SyncHistoryEntry = {
  synced_at: string
  paydex_score: number | null
  experian_score: number | null
  equifax_score: number | null
  tradeline_count: number | null
  changes: string[]
}

type Tradeline = {
  id: string
  creditor_name: string
  account_type: string
  credit_limit: number | null
  balance: number | null
  payment_status: string
  date_opened: string | null
  reporting_bureaus: string[]
  notes: string | null
  created_at: string
}

type SyncResult = {
  changes: string[]
  ai_insights: string[]
  next_actions: string[]
  synced_at: string
  extracted: {
    paydex_score: number | null
    experian_score: number | null
    equifax_score: number | null
    tradeline_count: number | null
  }
}

const ACCOUNT_TYPES = ['Vendor / Net-30', 'Business Credit Card', 'Line of Credit', 'Business Loan', 'Equipment Finance', 'Other']
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  current: 'bg-green-100 text-green-700',
  late_30: 'bg-amber-100 text-amber-700',
  late_60: 'bg-orange-100 text-orange-700',
  late_90: 'bg-red-100 text-red-700',
  charge_off: 'bg-red-200 text-red-800',
  paid: 'bg-gray-100 text-gray-500',
}
const BUREAUS = ['D&B', 'Experian', 'Equifax', 'Nav']

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))

export default function BusinessCreditMonitoringClient() {
  const { activeBusinessId } = useBusinessContext()
  const { locale } = useLanguage()
  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  const paymentStatusLabels: Record<string, string> = {
    current: text('Current', 'Al corriente'),
    late_30: text('30 Days Late', '30 dias de atraso'),
    late_60: text('60 Days Late', '60 dias de atraso'),
    late_90: text('90 Days Late', '90 dias de atraso'),
    charge_off: text('Charge-Off', 'Castigada'),
    paid: text('Paid/Closed', 'Pagada/Cerrada'),
  }

  const paydexLabel = (score: number | null) => {
    if (!score) return null
    if (score >= 90) return { label: text('Excellent - Pays Early', 'Excelente - Paga temprano'), color: 'text-green-600' }
    if (score >= 80) return { label: text('Good - Pays On Time', 'Bueno - Paga a tiempo'), color: 'text-blue-600' }
    if (score >= 70) return { label: text('Fair - Slight Delay', 'Regular - Ligero retraso'), color: 'text-amber-600' }
    return { label: text('Poor - Pays Late', 'Deficiente - Paga tarde'), color: 'text-red-600' }
  }

  const localizeTradelineNote = (note: string) => {
    if (locale !== 'es') return note

    const demoNoteMap: Record<string, string> = {
      'First net-30 account. 2 early payment cycles.': 'Primera cuenta net-30. 2 ciclos de pago anticipado.',
      'Office supplies account. 1 payment cycle completed.': 'Cuenta de suministros de oficina. 1 ciclo de pago completado.',
      'First net-30 account. Paid early 3 consecutive cycles.': 'Primera cuenta net-30. Pago anticipado en 3 ciclos consecutivos.',
      'Industrial supplies. Active account.': 'Suministros industriales. Cuenta activa.',
      'Recently started reporting.': 'Comenzo a reportar recientemente.',
      'Established account. Consistent early payment.': 'Cuenta establecida. Pago anticipado constante.',
      'All 3 bureaus reporting.': 'Los 3 buroes estan reportando.',
      'Revolving commercial account.': 'Cuenta comercial revolvente.',
      '5th reporting account — unlocked card eligibility.': '5.a cuenta reportando - desbloqueo elegibilidad para tarjetas.',
      'Most recent addition. Active purchasing.': 'Incorporacion mas reciente. Compras activas.',
    }

    return demoNoteMap[note] ?? note
  }

  const [bureauProfile, setBureauProfile] = useState<BureauProfile | null>(null)
  const [tradelines, setTradelines] = useState<Tradeline[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncText, setSyncText] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [form, setForm] = useState({
    creditor_name: '',
    account_type: 'Vendor / Net-30',
    credit_limit: '',
    balance: '',
    payment_status: 'current',
    date_opened: '',
    reporting_bureaus: [] as string[],
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!activeBusinessId) return
    setLoading(true)
    setBureauProfile(null)
    setTradelines([])
    const [profileRes, tlRes] = await Promise.all([
      fetch('/api/business-credit-profile').then((r) => r.json()),
      fetch('/api/business-tradelines').then((r) => r.json()),
    ])
    setBureauProfile(profileRes.profile || null)
    setTradelines(tlRes.tradelines || [])
    setLoading(false)
  }, [activeBusinessId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleBureau = (bureau: string) => {
    setForm((current) => ({
      ...current,
      reporting_bureaus: current.reporting_bureaus.includes(bureau)
        ? current.reporting_bureaus.filter((value) => value !== bureau)
        : [...current.reporting_bureaus, bureau],
    }))
  }

  const addTradeline = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)

    const res = await fetch('/api/business-tradelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setAdding(false)

    if (!res.ok) {
      toast.error(data.error || text('Failed to add tradeline', 'No se pudo agregar la tradeline'))
      return
    }

    setTradelines((prev) => [data.tradeline, ...prev])
    setForm({
      creditor_name: '',
      account_type: 'Vendor / Net-30',
      credit_limit: '',
      balance: '',
      payment_status: 'current',
      date_opened: '',
      reporting_bureaus: [],
      notes: '',
    })
    setShowAddForm(false)
    toast.success(text('Tradeline added', 'Tradeline agregada'))
  }

  const deleteTradeline = async (id: string) => {
    setTradelines((prev) => prev.filter((tradeline) => tradeline.id !== id))
    await fetch(`/api/business-tradelines?id=${id}`, { method: 'DELETE' })
    toast.success(text('Tradeline removed', 'Tradeline eliminada'))
  }

  const handleSync = async () => {
    if (!syncText.trim()) {
      toast.error(text('Paste your Nav data first', 'Pega primero tus datos de Nav'))
      return
    }

    setSyncing(true)
    try {
      const res = await fetch('/api/nav-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: syncText }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || text('Sync failed', 'La sincronizacion fallo'))
        return
      }

      setLastSyncResult(data)
      setSyncText('')
      setShowSyncModal(false)
      toast.success(text('Nav sync complete!', 'Sincronizacion de Nav completada'))
      await loadData()
    } catch {
      toast.error(text('Sync failed - please try again', 'La sincronizacion fallo - intenta de nuevo'))
    } finally {
      setSyncing(false)
    }
  }

  const activeTradelines = tradelines.filter((tradeline) => tradeline.payment_status !== 'paid')
  const totalCreditLimit = activeTradelines.reduce((sum, tradeline) => sum + (tradeline.credit_limit || 0), 0)
  const totalBalance = activeTradelines.reduce((sum, tradeline) => sum + (tradeline.balance || 0), 0)
  const utilization = totalCreditLimit > 0 ? Math.round((totalBalance / totalCreditLimit) * 100) : 0
  const paydexInfo = paydexLabel(bureauProfile?.paydex_score || null)
  const navConnected = bureauProfile?.nav_connection_status === 'connected'
  const lastSynced = bureauProfile?.nav_last_synced_at
  const staleSync = lastSynced && daysSince(lastSynced) >= 30
  const syncHistory = bureauProfile?.nav_sync_history ?? []

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-28 bg-gray-200 rounded-2xl" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <TrendingUp size={24} className="text-green-500" />
          {text('Business Credit Monitoring', 'Monitoreo de credito empresarial')}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {text(
            'Live monitoring of your business credit scores and tradeline portfolio',
            'Monitoreo en vivo de tus puntajes de credito empresarial y tu cartera de tradelines'
          )}
        </p>
      </div>

      {staleSync && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {text('Your business credit data may be outdated', 'Tus datos de credito empresarial pueden estar desactualizados')}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {text(
                `Last synced ${daysSince(lastSynced!)} days ago. Sync Nav to refresh your scores.`,
                `Ultima sincronizacion hace ${daysSince(lastSynced!)} dias. Sincroniza Nav para actualizar tus puntajes.`
              )}
            </p>
          </div>
          <button
            onClick={() => setShowSyncModal(true)}
            className="shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {text('Sync Now', 'Sincronizar ahora')}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-green-600" />
            <h2 className="font-bold text-gray-900">
              {text('Nav Credit Sync', 'Sincronizacion de credito con Nav')}
            </h2>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              navConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {navConnected ? text('Connected', 'Conectado') : text('Not Connected', 'No conectado')}
          </span>
        </div>

        {lastSynced && (
          <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
            <Clock size={11} /> {text('Last synced:', 'Ultima sincronizacion:')} {fmtDate(lastSynced)} (
            {text(`${daysSince(lastSynced)} days ago`, `hace ${daysSince(lastSynced)} dias`)})
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSyncModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <RefreshCw size={14} />
            {navConnected ? text('Sync Nav Data', 'Sincronizar datos de Nav') : text('Integrate Nav', 'Integrar Nav')}
          </button>
          <a
            href="/go/nav"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            {text('Open Nav Dashboard ->', 'Abrir panel de Nav ->')}
          </a>
          {syncHistory.length > 0 && (
            <button
              onClick={() => setShowHistory((current) => !current)}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {text('History', 'Historial')} ({syncHistory.length})
            </button>
          )}
        </div>

        {showHistory && syncHistory.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
            {syncHistory.slice(0, 5).map((entry, i) => (
              <div key={i} className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <p className="font-semibold text-gray-700 mb-1">{fmtDate(entry.synced_at)}</p>
                {entry.changes.map((change, j) => (
                  <p key={j} className="leading-5">• {change}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">PAYDEX</p>
          <p className={`text-3xl font-black ${bureauProfile?.paydex_score ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.paydex_score ?? '—'}
          </p>
          {paydexInfo && <p className={`text-xs font-semibold mt-1 ${paydexInfo.color}`}>{paydexInfo.label}</p>}
          <p className="text-[10px] text-gray-400 mt-1">{text('D&B Score', 'Puntaje D&B')}</p>
          {lastSynced && <p className="text-[10px] text-gray-300 mt-0.5">{text('Source: Nav', 'Fuente: Nav')}</p>}
        </div>

        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Intelliscore</p>
          <p className={`text-3xl font-black ${bureauProfile?.intelliscore ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.intelliscore ?? '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Experian</p>
          {lastSynced && <p className="text-[10px] text-gray-300 mt-0.5">{text('Source: Nav', 'Fuente: Nav')}</p>}
        </div>

        <div className="card text-center relative">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
            {text('Biz Score', 'Puntaje empresarial')}
          </p>
          <p className={`text-3xl font-black ${bureauProfile?.equifax_score ? 'text-gray-900' : 'text-gray-200'}`}>
            {bureauProfile?.equifax_score ?? '—'}
          </p>
          {!bureauProfile?.equifax_score && (
            <p className="text-[10px] font-semibold text-red-500 mt-1">
              {text('Not Reporting - Action Required', 'No reporta - accion requerida')}
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">Equifax</p>
        </div>

        <div className="card text-center">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
            {text('Utilization', 'Utilizacion')}
          </p>
          <p
            className={`text-3xl font-black ${
              utilization === 0
                ? 'text-gray-200'
                : utilization <= 30
                  ? 'text-green-600'
                  : utilization <= 60
                    ? 'text-amber-600'
                    : 'text-red-600'
            }`}
          >
            {totalCreditLimit > 0 ? `${utilization}%` : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{text('Business Credit', 'Credito empresarial')}</p>
        </div>
      </div>

      {lastSyncResult && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <h2 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" /> {text('What Changed', 'Que cambio')}
          </h2>
          <div className="space-y-1.5">
            {lastSyncResult.changes.map((change, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-blue-800">
                <CheckCircle2 size={14} className="text-blue-500 shrink-0 mt-0.5" />
                {change}
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-400 mt-3">{text('Synced', 'Sincronizado')} {fmtDate(lastSyncResult.synced_at)}</p>
        </div>
      )}

      {lastSyncResult && lastSyncResult.ai_insights.length > 0 && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
          <h2 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
            <Zap size={16} className="text-purple-600" /> {text('AI Insights', 'Insights de IA')}
          </h2>
          <div className="space-y-2">
            {lastSyncResult.ai_insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-purple-800">
                <span className="text-purple-400 font-bold shrink-0">{i + 1}.</span>
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      {lastSyncResult && lastSyncResult.next_actions.length > 0 && (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
          <h2 className="font-bold text-green-900 mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" /> {text('Next Actions', 'Siguientes acciones')}
          </h2>
          <div className="space-y-2">
            {lastSyncResult.next_actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-green-800">
                <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                {action}
              </div>
            ))}
          </div>
        </div>
      )}

      {(bureauProfile?.paydex_score || null) && (
        <div className="card bg-blue-50 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-blue-600" />
            <p className="text-sm font-bold text-blue-900">{text('PAYDEX Scale', 'Escala PAYDEX')}</p>
          </div>
          <div className="flex gap-1 mb-2">
            {[
              { range: '0-49', label: text('Poor', 'Deficiente'), color: 'bg-red-400' },
              { range: '50-79', label: text('Fair', 'Regular'), color: 'bg-amber-400' },
              { range: '80-89', label: text('Good', 'Bueno'), color: 'bg-blue-400' },
              { range: '90-100', label: text('Excellent', 'Excelente'), color: 'bg-green-500' },
            ].map((band) => (
              <div key={band.range} className="flex-1 text-center">
                <div className={`h-2 rounded-full ${band.color} mb-1`} />
                <p className="text-[9px] text-gray-500 font-semibold">{band.range}</p>
                <p className="text-[9px] text-gray-400">{band.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-700">
            {text('Current PAYDEX:', 'PAYDEX actual:')} <strong>{bureauProfile?.paydex_score}</strong> - {paydexInfo?.label}.{' '}
            {text('Pay vendors 5-10 days early to push toward 90+.', 'Paga a los proveedores 5-10 dias antes para acercarte a 90+.')}
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">{text('Tradeline Portfolio', 'Cartera de tradelines')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeTradelines.length} {text('active', 'activas')} · {totalCreditLimit > 0 ? `${fmt(totalCreditLimit)} ${text('total credit', 'credito total')}` : text('No credit limits logged', 'No hay limites de credito registrados')}
            </p>
          </div>
          <button onClick={() => setShowAddForm(true)} className="btn-primary text-sm px-3 py-2">
            <Plus size={15} /> {text('Add Tradeline', 'Agregar tradeline')}
          </button>
        </div>

        {showAddForm && (
          <div className="card mb-4 border-green-200 border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">{text('Add Tradeline', 'Agregar tradeline')}</h3>
              <button onClick={() => setShowAddForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={addTradeline} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">{text('Creditor / Vendor Name', 'Nombre del acreedor / proveedor')}</label>
                  <input
                    className="input-field"
                    placeholder={text('e.g. Uline, Grainger, Chase Ink', 'ej. Uline, Grainger, Chase Ink')}
                    required
                    value={form.creditor_name}
                    onChange={(e) => setForm((current) => ({ ...current, creditor_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{text('Account Type', 'Tipo de cuenta')}</label>
                  <select
                    className="input-field"
                    value={form.account_type}
                    onChange={(e) => setForm((current) => ({ ...current, account_type: e.target.value }))}
                  >
                    {ACCOUNT_TYPES.map((accountType) => <option key={accountType}>{accountType}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">{text('Credit Limit', 'Limite de credito')}</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="$0"
                    value={form.credit_limit}
                    onChange={(e) => setForm((current) => ({ ...current, credit_limit: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{text('Current Balance', 'Saldo actual')}</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="$0"
                    value={form.balance}
                    onChange={(e) => setForm((current) => ({ ...current, balance: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{text('Date Opened', 'Fecha de apertura')}</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.date_opened}
                    onChange={(e) => setForm((current) => ({ ...current, date_opened: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">{text('Payment Status', 'Estado de pago')}</label>
                <select
                  className="input-field"
                  value={form.payment_status}
                  onChange={(e) => setForm((current) => ({ ...current, payment_status: e.target.value }))}
                >
                  {Object.entries(paymentStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{text('Reporting Bureaus', 'Buroes que reportan')}</label>
                <div className="flex gap-2 flex-wrap">
                  {BUREAUS.map((bureau) => (
                    <button
                      key={bureau}
                      type="button"
                      onClick={() => toggleBureau(bureau)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        form.reporting_bureaus.includes(bureau)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'
                      }`}
                    >
                      {bureau}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{text('Notes (optional)', 'Notas (opcional)')}</label>
                <input
                  className="input-field"
                  placeholder={text('e.g. Net-30 terms, reports monthly', 'ej. terminos Net-30, reporta mensualmente')}
                  value={form.notes}
                  onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                />
              </div>
              <button type="submit" disabled={adding} className="btn-primary w-full">
                {adding ? <><Loader2 size={15} className="animate-spin" /> {text('Adding...', 'Agregando...')}</> : text('Add Tradeline', 'Agregar tradeline')}
              </button>
            </form>
          </div>
        )}

        {tradelines.length === 0 ? (
          <div className="card text-center py-10">
            <TrendingUp size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{text('No tradelines logged yet', 'Aun no hay tradelines registradas')}</p>
            <p className="text-xs text-gray-300 mt-1">{text('Add each business account that reports to the credit bureaus', 'Agrega cada cuenta empresarial que reporte a los buroes de credito')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tradelines.map((tradeline) => {
              const tradelineUtil =
                tradeline.credit_limit && tradeline.balance !== null
                  ? Math.round((tradeline.balance / tradeline.credit_limit) * 100)
                  : null

              return (
                <div key={tradeline.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{tradeline.creditor_name}</p>
                        <span className="text-xs text-gray-400">{tradeline.account_type}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_STATUS_COLORS[tradeline.payment_status]}`}>
                          {paymentStatusLabels[tradeline.payment_status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                        {tradeline.credit_limit !== null && <span>{text('Limit:', 'Limite:')} <strong className="text-gray-700">{fmt(tradeline.credit_limit)}</strong></span>}
                        {tradeline.balance !== null && <span>{text('Balance:', 'Saldo:')} <strong className="text-gray-700">{fmt(tradeline.balance)}</strong></span>}
                        {tradelineUtil !== null && <span className={tradelineUtil > 30 ? 'text-amber-600 font-semibold' : ''}>Util: {tradelineUtil}%</span>}
                        {tradeline.date_opened && <span>{text('Opened:', 'Abierta:')} {tradeline.date_opened}</span>}
                      </div>
                      {tradeline.reporting_bureaus.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {tradeline.reporting_bureaus.map((bureau) => (
                            <span key={bureau} className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">{bureau}</span>
                          ))}
                        </div>
                      )}
                      {tradeline.notes && <p className="text-xs text-gray-400 mt-1">{localizeTradelineNote(tradeline.notes)}</p>}
                    </div>
                    <button
                      onClick={() => deleteTradeline(tradeline.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card bg-green-50 border border-green-100">
        <p className="text-sm font-bold text-green-900 mb-2">{text('PAYDEX Building Tips', 'Consejos para construir PAYDEX')}</p>
        <ul className="space-y-1 text-xs text-green-700">
          <li>• {text('Pay all vendor invoices 5-10 days early to maximize PAYDEX reporting', 'Paga todas las facturas a proveedores 5-10 dias antes para maximizar el reporte PAYDEX')}</li>
          <li>• {text('A score of 80 = paid as agreed · 90+ = paid early - both unlock better terms', 'Un puntaje de 80 = pago segun lo acordado · 90+ = pago anticipado - ambos desbloquean mejores terminos')}</li>
          <li>• {text('Aim for 10+ unique tradelines across multiple bureaus within 12 months', 'Apunta a 10+ tradelines unicas en multiples buroes dentro de 12 meses')}</li>
          <li>• {text('Business credit accounts must be in the business name and EIN, not personal SSN', 'Las cuentas de credito empresarial deben estar a nombre del negocio y EIN, no del SSN personal')}</li>
          <li>• {text('Check your D&B profile at dnb.com monthly to verify tradelines are reporting correctly', 'Revisa tu perfil de D&B en dnb.com cada mes para verificar que las tradelines reporten correctamente')}</li>
        </ul>
      </div>

      {showSyncModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{text('Sync Your Business Credit', 'Sincroniza tu credito empresarial')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{text('Paste your Nav dashboard data to extract and update your scores', 'Pega los datos de tu panel de Nav para extraer y actualizar tus puntajes')}</p>
              </div>
              <button onClick={() => setShowSyncModal(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
            </div>

            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-800 mb-2">{text('Step 1 - Open Your Nav Dashboard', 'Paso 1 - Abre tu panel de Nav')}</p>
              <a
                href="/go/nav"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {text('Open Nav Dashboard ->', 'Abrir panel de Nav ->')}
              </a>
            </div>

            <div className="mb-4">
              <p className="text-xs font-bold text-gray-700 mb-2">{text('Step 2 - Copy & Paste Your Credit Data', 'Paso 2 - Copia y pega tus datos de credito')}</p>
              <p className="text-xs text-gray-500 mb-3">{text('Copy your PAYDEX, Experian, and Equifax scores from Nav and paste them below. Include any score numbers visible on your dashboard.', 'Copia tus puntajes PAYDEX, Experian y Equifax desde Nav y pegalos abajo. Incluye cualquier puntaje visible en tu panel.')}</p>
              <textarea
                value={syncText}
                onChange={(e) => setSyncText(e.target.value)}
                placeholder={text('Paste your Nav dashboard data here - include all score numbers, account summaries, and any visible credit information...', 'Pega aqui los datos de tu panel de Nav - incluye todos los puntajes, resumenes de cuentas y cualquier informacion de credito visible...')}
                rows={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSyncModal(false)}
                className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                {text('Cancel', 'Cancelar')}
              </button>
              <button
                onClick={handleSync}
                disabled={syncing || !syncText.trim()}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {syncing ? <><Loader2 size={14} className="animate-spin" /> {text('Syncing...', 'Sincronizando...')}</> : <><RefreshCw size={14} /> {text('Sync Now', 'Sincronizar ahora')}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
