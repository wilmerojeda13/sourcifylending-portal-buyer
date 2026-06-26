import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle, Bot, BarChart2, Shield, Users, DollarSign } from 'lucide-react'
import HomepageChatbot from '@/components/chatbot/HomepageChatbot'
import HomeNavbar from '@/components/i18n/HomeNavbar'
import { LOCALE_COOKIE, localizeHref, normalizeLocale, portalSignInHref, t } from '@/lib/i18n'
import { SITE_URL } from '@/lib/site-config'

export const metadata: Metadata = {
  title: 'SourcifyLending | Business Credit Fulfillment',
  description: 'Build business credit with an AI-guided fulfillment platform, program roadmap, and secure client portal.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'SourcifyLending | Business Credit Fulfillment',
    description: 'Build business credit with an AI-guided fulfillment platform, program roadmap, and secure client portal.',
    url: SITE_URL,
    siteName: 'SourcifyLending',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SourcifyLending | Business Credit Fulfillment',
    description: 'Build business credit with an AI-guided fulfillment platform, program roadmap, and secure client portal.',
  },
}

interface HomePageProps {
  searchParams?: Promise<{ code?: string; next?: string; sl_locale?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : {}
  const cookieStore = await cookies()
  const headerStore = await headers()
  const locale = normalizeLocale(headerStore.get('x-sl-locale') ?? cookieStore.get(LOCALE_COOKIE)?.value)

  if (params.code) {
    const nextPath = params.next && params.next.startsWith('/') ? params.next : '/portal'
    const localeQuery = params.sl_locale ? `&sl_locale=${encodeURIComponent(params.sl_locale)}` : ''
    redirect(`/auth/callback?code=${encodeURIComponent(params.code)}&next=${encodeURIComponent(nextPath)}${localeQuery}`)
  }

  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  const features = [
    {
      icon: Bot,
      title: text('AI Fulfillment Agent', 'Agente de cumplimiento con IA'),
      desc: text(
        'Your personal AI guides you through every stage, answers questions, reviews uploads, and keeps you on track.',
        'Tu IA personal te guía en cada etapa, responde preguntas, revisa documentos y te mantiene enfocado.'
      ),
      color: 'bg-green-100 text-green-600',
    },
    {
      icon: CheckCircle,
      title: text('Structured Task Manager', 'Gestor de tareas estructurado'),
      desc: text(
        'Step-by-step roadmap with tracked tasks, due dates, and stage progression — like Asana for credit building.',
        'Ruta paso a paso con tareas, fechas límite y progreso por etapa, como Asana para construir crédito.'
      ),
      color: 'bg-green-100 text-green-600',
    },
    {
      icon: BarChart2,
      title: text('Reports & Deliverables', 'Reportes y entregables'),
      desc: text(
        'AI-generated credit readiness summaries, tradeline reports, and monthly monitoring delivered inside your portal.',
        'Resúmenes de preparación crediticia, reportes de tradelines y monitoreo mensual dentro del portal.'
      ),
      color: 'bg-blue-100 text-blue-600',
    },
  ]

  const programs = [
    {
      badge: 'Program A',
      title: text('0% Intro APR Card Strategy', 'Estrategia de tarjetas con APR introductorio 0%'),
      desc: text(
        'For businesses ready to leverage 0% intro APR business credit cards as low-cost capital.',
        'Para negocios listos para aprovechar tarjetas de crédito empresarial con APR introductorio 0% como capital de bajo costo.'
      ),
      features: [
        text('Credit readiness review', 'Revisión de preparación crediticia'),
        text('Card sequencing strategy', 'Estrategia de secuencia de tarjetas'),
        text('Application timing guidance', 'Guía de momento para solicitudes'),
        text('Optimization tracking', 'Seguimiento de optimización'),
      ],
      color: 'border-green-200 bg-green-50/40',
      badgeColor: 'bg-green-100 text-green-700',
    },
    {
      badge: 'Program B',
      title: text('Business Credit Builder', 'Constructor de crédito empresarial'),
      desc: text(
        'Build your business credit under your EIN through a structured tradeline sequence.',
        'Construye tu crédito empresarial bajo tu EIN mediante una secuencia estructurada de tradelines.'
      ),
      features: [
        text('Entity & EIN setup', 'Configuración de entidad y EIN'),
        text('Vendor net-30 accounts', 'Cuentas de proveedor net-30'),
        text('Store & fleet credit', 'Crédito de tienda y flota'),
        text('Cash credit readiness', 'Preparación para crédito en efectivo'),
      ],
      color: 'border-emerald-200 bg-emerald-50/40',
      badgeColor: 'bg-emerald-100 text-emerald-700',
    },
    {
      badge: 'Program C',
      title: text('Capital Monitoring', 'Monitoreo de capital'),
      desc: text(
        'Monthly oversight, credit snapshots, and action plans to stay funding-ready.',
        'Supervisión mensual, instantáneas de crédito y planes de acción para seguir listo para financiamiento.'
      ),
      features: [
        text('Monthly credit snapshot', 'Instantánea mensual de crédito'),
        text('Banking analysis', 'Análisis bancario'),
        text('Risk scan', 'Escaneo de riesgo'),
        text('30-day action plan', 'Plan de acción de 30 días'),
      ],
      color: 'border-blue-200 bg-blue-50/40',
      badgeColor: 'bg-blue-100 text-blue-700',
    },
  ]

  const partnerBullets = [
    text('Partner-assisted clients can carry setup fees for A, B, and A+B because onboarding help is included', 'Los clientes asistidos por socios pueden incluir tarifas de configuración para A, B y A+B porque se incluye ayuda de incorporación'),
    text('Track partner clients, onboarding progress, and collected earnings from your portal', 'Haz seguimiento de clientes de socios, progreso de incorporación e ingresos cobrados desde tu portal'),
    text('Add and invite clients directly from your partner portal', 'Agrega e invita clientes directamente desde tu portal de socios'),
    text('Unlock free Program B access at 5 active clients', 'Desbloquea acceso gratuito al Programa B con 5 clientes activos'),
  ]

  return (
    <div className="min-h-screen bg-white">
      <HomeNavbar />

      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm mb-6">
          <Bot size={16} className="text-white" />
          {text('AI-Powered Credit Fulfillment Platform', 'Plataforma de cumplimiento de crédito con IA')}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          {text('Build Business Credit', 'Construye crédito empresarial')}<br />
          <span className="text-green-600">{text('With AI Guiding Every Step', 'Con IA guiando cada paso')}</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
          {text(
            "SourcifyLending's AI fulfillment agent manages your entire credit-building journey - from initial analysis to tradeline reporting, card acquisition, and funding readiness.",
            'El agente de cumplimiento con IA de SourcifyLending gestiona todo tu proceso de construcción de crédito: desde el análisis inicial hasta los reportes, adquisición de tarjetas y preparación para financiamiento.'
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={localizeHref('/analyzer', locale)} className="btn-primary text-base px-8 py-4" prefetch={false}>
            {text('Free Analyzer', 'Analizador gratis')} <ArrowRight size={18} />
          </Link>
          <Link href={portalSignInHref(locale)} className="btn-secondary text-base px-8 py-4" prefetch={false}>
            {text('Sign Into Portal', 'Entrar al portal')}
          </Link>
        </div>
      </section>

      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            {text('Everything You Need to Build Business Credit', 'Todo lo que necesitas para construir crédito empresarial')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="card text-center">
                <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  <Icon size={22} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">{text('Three Specialized Programs', 'Tres programas especializados')}</h2>
        <p className="text-gray-500 text-center mb-10">{text('The analyzer assigns you to the right program based on your profile.', 'El analizador te asigna al programa correcto según tu perfil.')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {programs.map(({ badge, title, desc, features, color, badgeColor }) => (
            <div key={badge} className={`card border-2 ${color}`}>
              <span className={`badge ${badgeColor} mb-3`}>{badge}</span>
              <h3 className="font-bold text-gray-900 mb-2 text-base">{title}</h3>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">{desc}</p>
              <ul className="space-y-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle size={14} className="text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16 px-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-8 sm:p-10 flex flex-col justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm mb-5 w-fit">
                  <Users size={13} className="text-white" />
                  {text('Partner Program', 'Programa de socios')}
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-snug">
                  {text('Close, onboard, and manage clients.', 'Cierra, incorpora y administra clientes.')}<br />
                  {text('Use SourcifyLending as the platform.', 'Usa SourcifyLending como la plataforma.')}
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-5">
                  {text(
                    'This is a partner-assisted model, not a passive referral program. Partners bring in the client, close the client, onboard the client, and stay the frontline relationship owner while SourcifyLending powers the infrastructure behind the scenes.',
                    'Este es un modelo asistido por socios, no un programa pasivo de referidos. Los socios atraen al cliente, cierran, incorporan y mantienen la relación principal mientras SourcifyLending impulsa la infraestructura detrás de escena.'
                  )}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{text('Program A / B / A+B Setup', 'Configuración Programa A / B / A+B')}</p>
                    <p className="text-xl font-bold text-gray-900">80%</p>
                    <p className="text-xs text-gray-500 mt-0.5">{text('Collected setup fee payout', 'Pago de tarifa de configuración cobrada')}</p>
                  </div>
                  <div className="rounded-xl border border-green-500 bg-green-700 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-white/85 uppercase tracking-wide mb-1">{text('Monthly Revenue', 'Ingresos mensuales')}</p>
                    <p className="text-xl font-bold text-white">20%</p>
                    <p className="text-xs text-white/80 mt-0.5">{text('Successful collected recurring revenue', 'Ingresos recurrentes cobrados con éxito')}</p>
                  </div>
                </div>

                <ul className="space-y-2 mb-8">
                  {partnerBullets.map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href={localizeHref('/partners', locale)} className="btn-primary text-sm px-6 py-3" prefetch={false}>
                    {text('Become a Partner', 'Hazte socio')} <ArrowRight size={16} />
                  </Link>
                  <Link href={locale === 'es' ? '/socios?sl_locale=es#how-it-works' : '/partners?sl_locale=en#how-it-works'} className="btn-secondary text-sm px-6 py-3">
                    {text('Learn More', 'Saber más')}
                  </Link>
                </div>
              </div>

              <div className="bg-green-600 p-8 sm:p-10 flex flex-col justify-center gap-6">
                {[
                  { icon: DollarSign, label: text('Program A partner-assisted', 'Programa A asistido por socio'), value: '$400 setup + $89.80/mo', sub: text('80% of setup + 20% recurring', '80% de configuración + 20% recurrente') },
                  { icon: DollarSign, label: text('Program B partner-assisted', 'Programa B asistido por socio'), value: '$240 setup + $49.80/mo', sub: text('80% of setup + 20% recurring', '80% de configuración + 20% recurrente') },
                  { icon: DollarSign, label: text('Program A + B partner-assisted', 'Programa A + B asistido por socio'), value: '$640 setup + $119.60/mo', sub: text('80% of setup + 20% recurring', '80% de configuración + 20% recurrente') },
                  { icon: Users, label: text('Free Program B access after', 'Acceso gratuito al Programa B después de'), value: text('5 active clients', '5 clientes activos'), sub: text('Maintained for 14 consecutive days', 'Mantenido durante 14 días consecutivos') },
                ].map(({ icon: Icon, label, value, sub }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white/90 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg leading-tight">{value}</p>
                      <p className="text-white/75 text-xs">{sub}</p>
                    </div>
                  </div>
                ))}
                <p className="text-white/75 text-xs mt-2">
                  {text(
                    'Partner compensation is earned only on partner-assisted clients you close and onboard. No payout on failed, refunded, disputed, or reversed payments.',
                    'La compensación del socio solo se gana con clientes asistidos por socios que cierras e incorporas. No hay pago en pagos fallidos, reembolsados, disputados o revertidos.'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-green-600 py-14 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <Shield size={36} className="text-white mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-3">
            {text('Find Out Where You Stand — Free', 'Descubre dónde estás — gratis')}
          </h2>
          <p className="text-white/90 mb-8 text-lg">
            {text('Complete the 12-question analyzer and get your program recommendation in under 3 minutes.', 'Completa el analizador de 12 preguntas y recibe tu recomendación de programa en menos de 3 minutos.')}
          </p>
          <Link href={localizeHref('/analyzer', locale)} className="inline-flex items-center gap-2 bg-white text-green-600 font-bold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors text-base" prefetch={false}>
            {text('Run Free Analyzer', 'Ejecutar analizador gratis')} <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            {text(
              `© ${new Date().getFullYear()} SourcifyLending. Results are not guaranteed. This platform does not promise approvals, specific credit limits, or funding outcomes.`,
              `© ${new Date().getFullYear()} SourcifyLending. Los resultados no están garantizados. Esta plataforma no promete aprobaciones, límites de crédito específicos ni resultados de financiamiento.`
            )}
          </p>
          <div className="flex flex-wrap items-center gap-5 text-sm text-gray-400">
            <Link href={localizeHref('/analyzer', locale)} className="brand-link-muted" prefetch={false}>{t(locale, 'nav.freeAnalyzer', 'Free Analyzer')}</Link>
            <Link href={localizeHref('/pricing', locale)} className="brand-link-muted" prefetch={false}>{t(locale, 'nav.pricing', 'Pricing')}</Link>
            <Link href={portalSignInHref(locale)} className="brand-link-muted" prefetch={false}>{text('Client Login', 'Acceso cliente')}</Link>
            <Link href="/privacy" className="brand-link-muted">{text('Privacy', 'Privacidad')}</Link>
            <Link href="/terms" className="brand-link-muted">{text('Terms', 'Términos')}</Link>
            <Link href={localizeHref('/partners', locale)} className="font-medium text-green-600 transition-colors hover:text-green-700" prefetch={false}>
              {text('Become a Partner', 'Hazte socio')}
            </Link>
            <Link href={localizeHref('/affiliate/login', locale)} className="brand-link-muted" prefetch={false}>{text('Partner Login', 'Acceso socios')}</Link>
          </div>
        </div>
      </footer>

      <HomepageChatbot />
    </div>
  )
}
