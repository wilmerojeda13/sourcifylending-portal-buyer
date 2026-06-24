'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle, DollarSign, Users, TrendingUp, Shield, Star, Loader2 } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { useLanguage } from '@/components/i18n/LanguageProvider'
import PublicMessagingConsent from '@/components/compliance/PublicMessagingConsent'
import TurnstileWidget from '@/components/compliance/TurnstileWidget'
import {
  CompliancePayload,
  CONSENT_TEXT_VERSION,
  REQUIRED_MESSAGING_DISCLOSURE,
} from '@/lib/public-form-compliance'
import { localizeHref } from '@/lib/i18n'

type MarketingChannel = { key: string; label: string }

export default function PartnersPage() {
  const { locale } = useLanguage()
  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company_name: '',
    website_or_social: '',
    promotion_plan: '',
    referral_experience: '',
    monthly_referral_estimate: '',
    marketing_channels: [] as string[],
    agreed_to_terms: false,
    consent: false,
  })

  const marketingChannelOptions: MarketingChannel[] = [
    { key: 'social_media', label: text('Social Media', 'Redes sociales') },
    { key: 'email_newsletter', label: text('Email Newsletter', 'Boletín por correo') },
    { key: 'paid_ads', label: text('Paid Ads', 'Anuncios pagados') },
    { key: 'business_network', label: text('Business Network', 'Red de negocios') },
    { key: 'youtube_podcast', label: text('YouTube / Podcast', 'YouTube / Pódcast') },
    { key: 'website_blog', label: text('Website / Blog', 'Sitio web / Blog') },
    { key: 'other', label: text('Other', 'Otro') },
  ]

  const howItWorksSteps = [
    {
      step: '01',
      icon: Users,
      title: text('Bring In The Client', 'Trae al cliente'),
      desc: text(
        'Add the client through your partner workflow or invite them from your partner portal. The client is marked as Partner-Assisted from the start.',
        'Agrega al cliente mediante tu flujo de trabajo de socio o inviítalo desde tu portal de socios. El cliente queda marcado como asistido por socio desde el inicio.'
      ),
    },
    {
      step: '02',
      icon: TrendingUp,
      title: text('You Close & Onboard', 'Tú cierras e incorporas'),
      desc: text(
        'You are expected to close the client, guide them into the right program, help with onboarding, and remain the frontline point of contact.',
        'Se espera que cierres al cliente, lo guíes al programa correcto, ayudes con la incorporación y sigas siendo el punto de contacto principal.'
      ),
    },
    {
      step: '03',
      icon: DollarSign,
      title: text('Earn Partner Compensation', 'Gana compensación'),
      desc: text(
        'Earn 80% of collected setup fees on partner-assisted Program A, B, and A+B deals, plus 20% of successful monthly subscription revenue.',
        'Gana 80% de las tarifas de configuración cobradas en acuerdos asistidos por socio del Programa A, B y A+B, más 20% de los ingresos mensuales cobrados con éxito.'
      ),
    },
  ]

  const commissionPlans = [
    {
      badge: 'Program A',
      setup: '$400',
      monthly: '$89.80/mo',
      setupNote: text('80% of $500 setup fee', '80% de la tarifa de configuración de $500'),
      monthlyNote: text('20% of $449/month', '20% de $449/mes'),
      year1: '$1,478+',
    },
    {
      badge: 'Program B',
      setup: '$240',
      monthly: '$49.80/mo',
      setupNote: text('80% of $300 setup fee', '80% de la tarifa de configuración de $300'),
      monthlyNote: text('20% of $249/month', '20% de $249/mes'),
      year1: '$838+',
    },
    {
      badge: 'Program C',
      setup: '—',
      monthly: '$19.40/mo',
      setupNote: text('No setup fee', 'Sin tarifa de configuración'),
      monthlyNote: text('20% of $97/month', '20% de $97/mes'),
      year1: '$233+',
    },
    {
      badge: 'Program A + B',
      setup: '$640',
      monthly: '$119.60/mo',
      setupNote: text('80% of $800 setup fee', '80% de la tarifa de configuración de $800'),
      monthlyNote: text('20% of $598/month', '20% de $598/mes'),
      year1: '$2,075+',
    },
  ]

  const audienceCards = [
    {
      title: text('Business Coaches', 'Coaches de negocios'),
      desc: text('You work with small business owners who need credit solutions.', 'Trabajas con dueños de pequeñas empresas que necesitan soluciones de crédito.'),
    },
    {
      title: text('Financial Educators', 'Educadores financieros'),
      desc: text('You can guide business owners through closing, onboarding, and using the platform.', 'Puedes guiar a los dueños de negocios en el cierre, la incorporación y el uso de la plataforma.'),
    },
    {
      title: text('Consultants & Agencies', 'Consultores y agencias'),
      desc: text('You want infrastructure behind the scenes while you stay client-facing.', 'Quieres infraestructura detrás de escena mientras sigues frente al cliente.'),
    },
    {
      title: text('Networkers & Brokers', 'Conectores y corredores'),
      desc: text('You have relationships with business owners who need capital and ongoing implementation support.', 'Tienes relaciones con dueños de negocios que necesitan capital y apoyo continuo de implementación.'),
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          turnstileToken,
          referral_experience: form.referral_experience === 'yes',
          compliance: {
            enabled: true,
            form_name: 'public_partner_application',
            page_url: typeof window !== 'undefined' ? window.location.href : '/partners',
            timestamp: new Date().toISOString(),
            consent_text_version: CONSENT_TEXT_VERSION,
            disclosure_text: REQUIRED_MESSAGING_DISCLOSURE,
            consent_given: form.consent,
          } satisfies CompliancePayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || text('Something went wrong. Please try again.', 'Algo salió mal. Inténtalo de nuevo.'))
      } else {
        setSuccess(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError(text('Network error. Please check your connection and try again.', 'Error de red. Revisa tu conexión e inténtalo de nuevo.'))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
        <Link href={localizeHref('/', locale)} className="flex min-w-0 items-center gap-2 sm:gap-2.5" prefetch={false}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600 sm:h-9 sm:w-9">
            <span className="text-xs font-bold text-white sm:text-sm">SL</span>
          </div>
          <span className="truncate whitespace-nowrap text-sm font-bold text-gray-900 sm:text-base">SourcifyLending</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link href={localizeHref('/affiliate/login', locale)} className="brand-link whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm" prefetch={false}>
            {text('Partner Login', 'Acceso de socios')}
          </Link>
          <Link href={localizeHref('/pricing', locale)} className="brand-link hidden px-3 py-2 text-sm font-medium sm:inline" prefetch={false}>
            {text('Pricing', 'Precios')}
          </Link>
          <Link href={localizeHref('/login', locale)} className="brand-link hidden px-3 py-2 text-sm font-medium sm:inline" prefetch={false}>
            {text('Sign In', 'Ingresar')}
          </Link>
          <Link href={localizeHref('/analyzer', locale)} className="btn-primary whitespace-nowrap px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm" prefetch={false}>
            {text('Free Analyzer', 'Analizador gratis')}
          </Link>
          <LanguageToggle />
        </div>
      </header>

      {success ? (
        <section className="mx-auto max-w-2xl px-6 py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="mb-4 text-3xl font-bold text-gray-900">{text('Application Submitted!', '¡Solicitud enviada!')}</h1>
          <p className="mb-8 text-lg leading-relaxed text-gray-500">
            {text(
              'Thank you for your interest in the SourcifyLending Partner Program. Our team will review your application and follow up within ',
              'Gracias por tu interés en el Programa de Socios de SourcifyLending. Nuestro equipo revisará tu solicitud y dará seguimiento dentro de '
            )}
            <strong className="text-gray-700">{text('2 business days', '2 días hábiles')}</strong>
            .
          </p>
          <div className="mb-8 rounded-2xl border border-green-100 bg-green-50 p-6 text-left">
            <h3 className="mb-3 text-sm font-bold text-green-900">{text('What happens next', 'Qué sigue')}</h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                {text('Our team reviews your application', 'Nuestro equipo revisa tu solicitud')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                {text('If approved, you&apos;ll receive login credentials for your partner portal', 'Si se aprueba, recibirás credenciales de acceso para tu portal de socios')}
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="mt-0.5 shrink-0" />
                {text('We&apos;ll confirm how you add, onboard, and support partner-assisted clients', 'Confirmaremos cómo agregar, incorporar y dar soporte a los clientes asistidos por socios')}
              </li>
            </ul>
          </div>
          <Link href={localizeHref('/', locale)} className="btn-secondary inline-flex items-center gap-2 px-6 py-3 text-sm" prefetch={false}>
            {text('Back to Home', 'Volver al inicio')}
          </Link>
        </section>
      ) : (
        <>
          <section className="mx-auto max-w-4xl px-6 pb-14 pt-16 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
              <Star size={14} className="text-white" />
              {text('SourcifyLending Partner Program', 'Programa de socios de SourcifyLending')}
            </div>
            <h1 className="mb-6 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
              {text('Close and onboard clients.', 'Cierra e incorpora clientes.')}<br />
              <span className="text-green-700">{text('Run your client book on SourcifyLending.', 'Administra tu cartera en SourcifyLending.')}</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-500">
              {text(
                'This is a true partner-assisted model, not a passive referral program. Partners bring in the client, close the client, onboard the client, and remain the frontline relationship owner while SourcifyLending provides the platform, billing rails, and fulfillment infrastructure.',
                'Este es un modelo verdaderamente asistido por socios, no un programa pasivo de referidos. Los socios atraen al cliente, cierran, incorporan y permanecen como el responsable principal de la relación mientras SourcifyLending proporciona la plataforma, los flujos de cobro y la infraestructura de cumplimiento.'
              )}
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button
                onClick={() => {
                  setShowForm(true)
                  setTimeout(() => document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' }), 50)
                }}
                className="btn-primary px-8 py-4 text-base"
              >
                {text('Apply Now', 'Aplicar ahora')} <ArrowRight size={18} />
              </button>
              <a href="#how-it-works" className="btn-secondary px-8 py-4 text-base">
                {text('Learn More', 'Saber más')}
              </a>
            </div>
          </section>

          <section className="bg-green-600 px-6 py-10">
            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 text-center sm:grid-cols-3">
              {[
                { value: '80%', label: text('Setup fee payout on Program A, B & A+B', 'Pago de tarifa de configuración en Programa A, B y A+B') },
                { value: '20%', label: text('Recurring monthly commission', 'Comisión mensual recurrente') },
                { value: text('5 clients', '5 clientes'), label: text('Unlocks free Program B access', 'Desbloquea acceso gratuito al Programa B') },
              ].map((s) => (
                <div key={s.label}>
                  <p className="mb-1 text-3xl font-bold text-white">{s.value}</p>
                  <p className="text-sm text-white/90">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="how-it-works" className="bg-gray-50 px-6 py-16">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-3 text-center text-2xl font-bold text-gray-900">{text('How It Works', 'Cómo funciona')}</h2>
              <p className="mb-12 text-center text-gray-500">{text('Three simple steps. Partners own the relationship.', 'Tres pasos simples. Los socios controlan la relación.')}</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {howItWorksSteps.map(({ step, icon: Icon, title, desc }) => (
                  <div key={step} className="card relative">
                    <span className="absolute right-5 top-5 text-3xl font-black text-gray-100">{step}</span>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                      <Icon size={22} />
                    </div>
                    <h3 className="mb-2 font-bold text-gray-900">{title}</h3>
                    <p className="text-sm leading-relaxed text-gray-500">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="mb-3 text-center text-2xl font-bold text-gray-900">{text('Commission Structure', 'Estructura de comisiones')}</h2>
            <p className="mb-10 text-center text-gray-500">{text('Paid only on successful collected revenue. No payout on failed charges, disputes, or refunds.', 'Se paga solo sobre ingresos cobrados con éxito. No hay pago por cargos fallidos, disputas o reembolsos.')}</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {commissionPlans.map((plan) => (
                <div key={plan.badge} className="card border-2 border-gray-200">
                  <span className="badge mb-3 bg-green-100 text-green-700">{plan.badge}</span>
                  <div className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{plan.setup}</p>
                      <p className="text-xs text-gray-400">{text('Setup commission', 'Comisión de configuración')} · {plan.setupNote}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{plan.monthly}</p>
                      <p className="text-xs text-gray-400">{text('Recurring commission', 'Comisión recurrente')} · {plan.monthlyNote}</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500">{text('Year 1 estimate', 'Estimación del primer año')}</p>
                    <p className="text-lg font-bold text-green-600">{plan.year1}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-gray-400">
              {text(
                'Estimates assume one active partner-assisted client per program for 12 months. Actual earnings vary and are never guaranteed.',
                'Las estimaciones asumen un cliente asistido por socio activo por programa durante 12 meses. Los ingresos reales varían y nunca están garantizados.'
              )}
            </p>
          </section>

          <section className="bg-gray-50 px-6 py-16">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                <Star size={14} className="text-white" />
                {text('Performance Incentive', 'Incentivo de rendimiento')}
              </div>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">{text('Unlock Free Program B Access', 'Desbloquea acceso gratis al Programa B')}</h2>
              <p className="mb-10 text-base leading-relaxed text-gray-500">
                {text(
                  'Maintain 5 active paying partner-assisted clients for 14 consecutive days and earn complimentary access to Program B — the Business Credit Builder — at no cost. Access is automatically unlocked and automatically revoked if you fall below the threshold.',
                  'Mantén 5 clientes asistidos por socios activos y de pago durante 14 días consecutivos y obtén acceso gratuito al Programa B — el Constructor de Crédito Empresarial — sin costo. El acceso se desbloquea automáticamente y se revoca automáticamente si bajas del umbral.'
                )}
              </p>
              <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                {[
                { number: '5', label: text('Active paying partner clients required', 'Se requieren clientes socios activos de pago') },
                { number: '14', label: text('Consecutive days to qualify', 'Días consecutivos para calificar') },
                  { number: text('Free', 'Gratis'), label: text('Program B access unlocked', 'Acceso al Programa B desbloqueado') },
                ].map(({ number, label }) => (
                  <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="mb-1 text-3xl font-bold text-green-700">{number}</p>
                    <p className="text-sm text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-gray-400">
                {text(
                  'Complimentary access applies to Program B only. Non-transferable. No cash value. Access locks immediately if you fall below 5 active paying clients.',
                  'El acceso gratuito aplica solo al Programa B. No transferible. Sin valor en efectivo. El acceso se bloquea de inmediato si bajas de 5 clientes activos de pago.'
                )}
              </p>
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">{text('Who This Is For', 'Para quién es')}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {audienceCards.map(({ title, desc }) => (
                <div key={title} className="card">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-green-100">
                    <CheckCircle size={16} className="text-green-600" />
                  </div>
                  <h3 className="mb-1 text-sm font-bold text-gray-900">{title}</h3>
                  <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="apply-form" className="bg-gray-50 px-6 py-16">
            <div className="mx-auto max-w-2xl">
              <div className="mb-10 text-center">
                <h2 className="mb-3 text-2xl font-bold text-gray-900">{text('Apply to Become a Partner', 'Aplica para ser socio')}</h2>
                <p className="text-gray-500">
                  {text(
                    'All applications are reviewed manually. We&apos;ll confirm fit for a partner-assisted sales relationship within 2 business days.',
                    'Todas las solicitudes se revisan manualmente. Confirmaremos si encaja en una relación de ventas asistida por socios dentro de 2 días hábiles.'
                  )}
                </p>
              </div>

              {!showForm && (
                <div className="text-center">
                  <button onClick={() => setShowForm(true)} className="btn-primary px-10 py-4 text-base">
                    {text('Open Application', 'Abrir solicitud')} <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {showForm && (
                <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        {text('Full Name', 'Nombre completo')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={text('Jane Smith', 'Juana Pérez')}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        {text('Email Address', 'Correo electrónico')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder={text('jane@example.com', 'juan@example.com')}
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{text('Phone', 'Teléfono')}</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="(555) 000-0000"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{text('Company / Brand Name', 'Nombre de la empresa / marca')}</label>
                      <input
                        type="text"
                        value={form.company_name}
                        onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                        placeholder={text('Acme LLC (optional)', 'Acme LLC (opcional)')}
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">{text('Website or Social Profile', 'Sitio web o perfil social')}</label>
                    <input
                      type="url"
                      value={form.website_or_social}
                      onChange={(e) => setForm(f => ({ ...f, website_or_social: e.target.value }))}
                      placeholder={text('https://yoursite.com or @yourhandle', 'https://tusitio.com o @tuusuario')}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">{text('How do you plan to promote? (select all that apply)', '¿Cómo planeas promocionar? (selecciona todas las que apliquen)')}</label>
                    <div className="flex flex-wrap gap-2">
                      {marketingChannelOptions.map((ch) => (
                        <button
                          key={ch.key}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            marketing_channels: f.marketing_channels.includes(ch.key)
                              ? f.marketing_channels.filter(c => c !== ch.key)
                              : [...f.marketing_channels, ch.key],
                          }))}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                            form.marketing_channels.includes(ch.key)
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">{text('Estimated monthly referral volume', 'Volumen mensual estimado de referidos')}</label>
                    <select
                      value={form.monthly_referral_estimate}
                      onChange={(e) => setForm(f => ({ ...f, monthly_referral_estimate: e.target.value }))}
                      className="input-field"
                    >
                      <option value="">{text('Select an estimate', 'Selecciona un estimado')}</option>
                      <option value="1-3">{text('1–3 per month', '1–3 por mes')}</option>
                      <option value="4-10">{text('4–10 per month', '4–10 por mes')}</option>
                      <option value="11-25">{text('11–25 per month', '11–25 por mes')}</option>
                      <option value="25+">{text('25+ per month', '25+ por mes')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      {text('Have you closed and onboarded business funding or credit clients before?', '¿Has cerrado e incorporado clientes de financiamiento o crédito antes?')} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-4">
                      {[
                        { value: 'yes', label: text('Yes', 'Sí') },
                        { value: 'no', label: text('No', 'No') },
                      ].map((item) => (
                        <label key={item.value} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="referral_experience"
                            value={item.value}
                            checked={form.referral_experience === item.value}
                            onChange={() => setForm(f => ({ ...f, referral_experience: item.value }))}
                            className="accent-green-600"
                            required
                          />
                          <span className="text-sm text-gray-700">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {text('How do you plan to promote SourcifyLending?', '¿Cómo planeas promocionar SourcifyLending?')} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={form.promotion_plan}
                      onChange={(e) => setForm(f => ({ ...f, promotion_plan: e.target.value }))}
                      placeholder={text(
                        'Describe how you would bring in clients, close them, onboard them, and remain their frontline point of contact.',
                        'Describe cómo atraerías clientes, los cerrarías, los incorporarías y permanecerías como su punto de contacto principal.'
                      )}
                      className="input-field resize-none"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        required
                        checked={form.agreed_to_terms}
                        onChange={(e) => setForm(f => ({ ...f, agreed_to_terms: e.target.checked }))}
                        className="mt-0.5 accent-green-600"
                      />
                      <span className="text-sm leading-relaxed text-gray-600">
                        {text(
                          'I agree to the SourcifyLending Partner Program terms. I understand that partners may not promise approvals, guarantee funding amounts, or misrepresent SourcifyLending&apos;s services. I will use only approved marketing language. I understand that partner compensation is earned only on partner-assisted clients I close and onboard, and only on successfully collected revenue. SourcifyLending may suspend or terminate partner access at any time for violations.',
                          'Acepto los términos del Programa de Socios de SourcifyLending. Entiendo que los socios no pueden prometer aprobaciones, garantizar montos de financiamiento ni tergiversar los servicios de SourcifyLending. Usaré solo el lenguaje de marketing aprobado. Entiendo que la compensación del socio se gana solo con clientes asistidos por socios que cierre e incorpore, y solo sobre ingresos cobrados con éxito. SourcifyLending puede suspender o terminar el acceso del socio en cualquier momento por incumplimientos.'
                        )}
                        <span className="ml-1 text-red-500">*</span>
                      </span>
                    </label>
                  </div>

                  <PublicMessagingConsent
                    checked={form.consent}
                    onChange={(checked) => setForm(f => ({ ...f, consent: checked }))}
                  />

                  <TurnstileWidget token={turnstileToken} onTokenChange={setTurnstileToken} />

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !form.consent || !turnstileEnabled || !turnstileToken}
                    className="btn-primary w-full py-4 text-base disabled:opacity-60"
                  >
                    {loading ? (
                      <><Loader2 size={18} className="animate-spin" /> {text('Submitting…', 'Enviando…')}</>
                    ) : (
                      <>{text('Submit Application', 'Enviar solicitud')} <ArrowRight size={18} /></>
                    )}
                  </button>

                  <p className="text-center text-xs text-gray-400">
                    {text('We review all applications manually and respond within 2 business days.', 'Revisamos todas las solicitudes manualmente y respondemos dentro de 2 días hábiles.')}
                  </p>
                </form>
              )}
            </div>
          </section>

          <section className="bg-green-600 px-6 py-14 text-center">
            <div className="mx-auto max-w-2xl">
              <Shield size={36} className="mx-auto mb-4 text-green-200" />
              <h2 className="mb-3 text-2xl font-bold text-white">{text('Ready to Get Started?', '¿Listo para empezar?')}</h2>
              <p className="mb-8 text-green-200">
                {text(
                  'Join partners who want to manage their own client book using SourcifyLending as the platform behind the scenes.',
                  'Únete a los socios que quieren administrar su propia cartera de clientes usando SourcifyLending como la plataforma detrás de escena.'
                )}
              </p>
              <button
                onClick={() => {
                  setShowForm(true)
                  document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-green-600 transition-colors hover:bg-green-50"
              >
                {text('Apply Now', 'Aplicar ahora')} <ArrowRight size={18} />
              </button>
            </div>
          </section>

          <footer className="border-t border-gray-100 px-6 py-8">
            <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-sm text-gray-400">
                {text(
                  `© ${new Date().getFullYear()} SourcifyLending. Partner earnings are not guaranteed. Compensation is earned on successfully collected payments only.`,
                  `© ${new Date().getFullYear()} SourcifyLending. Las ganancias de los socios no están garantizadas. La compensación se gana solo sobre pagos cobrados con éxito.`
                )}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <Link href={localizeHref('/', locale)} className="brand-link-muted" prefetch={false}>{text('Home', 'Inicio')}</Link>
                <Link href={localizeHref('/analyzer', locale)} className="brand-link-muted" prefetch={false}>{text('Free Analyzer', 'Analizador gratis')}</Link>
                <Link href={localizeHref('/affiliate/login', locale)} className="brand-link-muted" prefetch={false}>{text('Partner Login', 'Acceso de socios')}</Link>
                <Link href={localizeHref('/login', locale)} className="brand-link-muted" prefetch={false}>{text('Client Login', 'Acceso de cliente')}</Link>
                <Link href="/privacy" className="brand-link-muted" prefetch={false}>{text('Privacy', 'Privacidad')}</Link>
                <Link href="/terms" className="brand-link-muted" prefetch={false}>{text('Terms', 'Términos')}</Link>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
// PUBLIC_FORM_COMPLIANCE_OK
