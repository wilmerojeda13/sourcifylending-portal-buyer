'use client'

import { useState } from 'react'
import { User, Building2, Mail, Phone, CheckCircle2, XCircle, Loader2, Settings } from 'lucide-react'
import DelegateAccessPanel from '@/components/DelegateAccessPanel'
import NotificationPreferencesCard from '@/components/notifications/NotificationPreferencesCard'
import { useLanguage } from '@/components/i18n/LanguageProvider'

interface ProfileData {
  full_name: string
  email: string
  business_name: string
  entity_type: string
  industry: string
  phone: string
}

interface Props {
  initialProfile: ProfileData
  activeBusinessName?: string
  isDelegate?: boolean
}

const ENTITY_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Sole Proprietorship', 'Partnership', 'Non-Profit', 'Other']
const INDUSTRIES = [
  'Construction', 'Trucking / Transportation', 'HVAC', 'Retail',
  'Restaurant / Food Service', 'Healthcare', 'Technology', 'Real Estate',
  'Professional Services', 'Manufacturing', 'Wholesale / Distribution', 'Other',
]

const ENTITY_TYPE_LABELS: Record<string, string> = {
  'Sole Proprietorship': 'Propietario unico',
  Partnership: 'Sociedad',
  'Non-Profit': 'Sin fines de lucro',
  Other: 'Otro',
}

const INDUSTRY_LABELS: Record<string, string> = {
  Construction: 'Construccion',
  'Trucking / Transportation': 'Camiones / transporte',
  HVAC: 'HVAC',
  Retail: 'Comercio minorista',
  'Restaurant / Food Service': 'Restaurantes / servicio de alimentos',
  Healthcare: 'Salud',
  Technology: 'Tecnologia',
  'Real Estate': 'Bienes raices',
  'Professional Services': 'Servicios profesionales',
  Manufacturing: 'Manufactura',
  'Wholesale / Distribution': 'Mayoreo / distribucion',
  Other: 'Otro',
}

export default function SettingsClient({ initialProfile, activeBusinessName = 'This business', isDelegate = false }: Props) {
  const { locale } = useLanguage()
  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const localizeEntityType = (value: string) => (locale === 'es' ? (ENTITY_TYPE_LABELS[value] ?? value) : value)
  const localizeIndustry = (value: string) => (locale === 'es' ? (INDUSTRY_LABELS[value] ?? value) : value)
  const [form, setForm] = useState<ProfileData>(initialProfile)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof ProfileData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.full_name.trim()) { setError(locale === 'es' ? 'El nombre no puede estar vacío.' : 'Name cannot be blank.'); return }
    if (!form.email.trim()) { setError(locale === 'es' ? 'El correo no puede estar vacío.' : 'Email cannot be blank.'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) { setError(locale === 'es' ? 'Por favor ingresa una dirección de correo válida.' : 'Please enter a valid email address.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok && !data.profileUpdated) {
        setError(data.error || (locale === 'es' ? 'No se pudieron guardar los cambios.' : 'Failed to save changes.'))
        return
      }

      if (data.emailChangeRequested) {
        setSuccess(locale === 'es'
          ? 'Perfil guardado. Se ha enviado un correo de confirmación a tu nueva dirección.'
          : 'Profile saved. A confirmation email has been sent to your new email address — please check your inbox to confirm the change.')
      } else if (data.profileUpdated && !res.ok) {
        setError(data.error)
        setSuccess(locale === 'es' ? 'La información del perfil se guardó correctamente.' : 'Profile information saved successfully.')
      } else {
        setSuccess(locale === 'es' ? 'Tu perfil se actualizó correctamente.' : 'Your profile has been updated successfully.')
      }
    } catch {
      setError(locale === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {isDelegate && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-blue-600 mt-0.5">ℹ️</span>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {locale === 'es'
              ? 'Has iniciado sesión como delegado. Puedes actualizar tu perfil personal, pero la facturación y la suscripción solo están disponibles para el propietario de la cuenta.'
              : 'You are logged in as a delegate. You can update your personal profile, but billing and subscription management are only available to the account owner.'}
          </p>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings size={20} className="text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{locale === 'es' ? 'Configuración' : 'Settings'}</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {locale === 'es'
            ? 'Actualiza tu perfil e información de la cuenta. Mantén tus datos de contacto al día para que podamos apoyarte.'
            : 'Update your profile and account information. Keep your contact details current so we can support your account.'}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center gap-2">
            <User size={15} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{locale === 'es' ? 'Información personal' : 'Personal Information'}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                {locale === 'es' ? 'Nombre completo' : 'Full Name'} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder={locale === 'es' ? 'Tu nombre completo' : 'Your full name'}
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <Mail size={11} />
                  {locale === 'es' ? 'Correo electrónico' : 'Email Address'} <span className="text-red-400">*</span>
                </span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder={text('your@email.com', 'tu@correo.com')}
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              />
              {form.email !== initialProfile.email && (
                <p className="mt-1.5 text-xs text-amber-600">
                  {locale === 'es'
                    ? 'Cambiar tu correo requiere confirmación. Se enviará un enlace de verificación a tu nueva dirección.'
                    : 'Changing your email requires confirmation. A verification link will be sent to your new address.'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <Phone size={11} />
                  {locale === 'es' ? 'Número de teléfono' : 'Phone Number'}
                </span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="(555) 000-0000"
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center gap-2">
            <Building2 size={15} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{locale === 'es' ? 'Información del negocio' : 'Business Information'}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                {locale === 'es' ? 'Nombre del negocio' : 'Business Name'}
              </label>
              <input
                type="text"
                value={form.business_name}
                onChange={e => set('business_name', e.target.value)}
                placeholder={locale === 'es' ? 'Nombre de tu negocio' : 'Your business name'}
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                {locale === 'es' ? 'Tipo de entidad' : 'Entity Type'}
              </label>
              <select
                value={form.entity_type}
                onChange={e => set('entity_type', e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              >
                <option value="">{locale === 'es' ? 'Selecciona un tipo de entidad…' : 'Select entity type…'}</option>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{localizeEntityType(t)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                {locale === 'es' ? 'Industria' : 'Industry'}
              </label>
              <select
                value={form.industry}
                onChange={e => set('industry', e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                disabled={loading}
              >
                <option value="">{locale === 'es' ? 'Selecciona una industria…' : 'Select industry…'}</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{localizeIndustry(i)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-xl px-4 py-3">
            <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl px-4 py-3">
            <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-400">{success}</p>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {locale === 'es' ? 'Guardando…' : 'Saving…'}
              </>
            ) : (
              locale === 'es' ? 'Guardar cambios' : 'Save Changes'
            )}
          </button>
        </div>
      </form>

      <NotificationPreferencesCard
        scope="member"
        title={locale === 'es' ? 'Configuración de notificaciones' : 'Notification Settings'}
        description={locale === 'es'
          ? `Administra alertas de escritorio para ${activeBusinessName}. En móvil se siguen usando notificaciones y badges dentro de la app.`
          : `Manage desktop alerts for ${activeBusinessName}. Mobile continues to use in-app notifications and badges.`}
      />

      <DelegateAccessPanel />
    </div>
  )
}
