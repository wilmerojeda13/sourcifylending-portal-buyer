import Link from 'next/link'
import { cookies } from 'next/headers'
import { CheckCircle, X, Minus, ArrowRight } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { LOCALE_COOKIE, localizeHref, normalizeLocale, portalSignInHref } from '@/lib/i18n'

const PLANS = [
  {
    id: 'free',
    badge: 'Free',
    title: 'Free',
    price: '$0',
    period: '/month',
    description: 'Start with the free analyzer and see where your business stands.',
    features: [
      'Free business credit analyzer',
      'Instant readiness score',
      'Personalized recommendations',
      'No credit card required',
    ],
    cta: 'Start Free Analyzer',
    href: '/analyzer',
    footer: null,
    style: {
      card: 'border border-gray-200 bg-white',
      badge: 'bg-gray-100 text-gray-600',
      price: 'text-gray-900',
      cta: 'btn-primary w-full',
    },
  },
  {
    id: 'program_c',
    badge: 'Program C',
    title: 'Capital Monitoring',
    price: '$97',
    period: '/month',
    description: 'Monitor your business credit profile, track progress, and stay funding-ready.',
    features: [
      'Client portal access',
      'Business credit monitoring dashboard',
      'Funding readiness score',
      'Monthly progress reports',
      'AI-assisted credit analysis',
      'Free business credit analyzer included',
    ],
    cta: 'Start 3-Day Free Trial',
    href: '/trial-start?program=program_c',
    footer: 'No charge today',
    style: {
      card: 'border-2 border-green-500 bg-green-700',
      badge: 'bg-green-500 text-white',
      price: 'text-white',
      cta: 'bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl border border-white/20 transition-colors duration-150 inline-flex items-center justify-center gap-2 text-sm w-full',
    },
  },
  {
    id: 'program_b',
    badge: 'Program B',
    title: 'Business Credit Builder',
    price: '$249',
    period: '/month',
    description: 'Actively build your business credit profile under your EIN with guided workflow and structured tools.',
    features: [
      'Client portal access',
      'Guided business credit building workflow',
      'Vendor and tradeline strategy',
      'Business credit profile development',
      'Document organization and milestones',
      'Task management and progress tracking',
    ],
    cta: 'Start 3-Day Free Trial',
    href: '/trial-start?program=program_b',
    footer: 'No charge today',
    style: {
      card: 'border-2 border-green-400 bg-white',
      badge: 'bg-green-100 text-green-700',
      price: 'text-gray-900',
      cta: 'btn-primary w-full',
    },
  },
  {
    id: 'program_a',
    badge: 'Program A',
    title: '0% APR Card Strategy',
    price: '$449',
    period: '/month',
    description: 'Re-optimize your personal credit and deploy a 0% intro APR card strategy to access business funding capital.',
    features: [
      'Client portal access',
      'Personal credit review and re-optimization',
      'Credit report review and dispute workflow',
      '0% intro APR card strategy',
      'Card sequencing and optimization',
      'Personal credit readiness for funding',
    ],
    cta: 'Start 3-Day Free Trial',
    href: '/trial-start?program=program_a',
    footer: 'No charge today',
    style: {
      card: 'border-2 border-slate-700 bg-slate-900',
      badge: 'bg-slate-700 text-white',
      price: 'text-white',
      cta: 'bg-slate-800 hover:bg-slate-700 text-white font-semibold px-5 py-3 rounded-xl border border-white/10 transition-colors duration-150 inline-flex items-center justify-center gap-2 text-sm w-full',
    },
  },
] as const

type CheckValue = 'yes' | 'partial' | 'no'

const COMPARISON_ROWS: { feature: string; sl: CheckValue; tools: CheckValue; brokers: CheckValue; diy: CheckValue }[] = [
  { feature: 'Free analyzer', sl: 'yes', tools: 'yes', brokers: 'no', diy: 'no' },
  { feature: 'Client portal access', sl: 'yes', tools: 'no', brokers: 'no', diy: 'no' },
  { feature: 'Guided credit-building workflow', sl: 'yes', tools: 'no', brokers: 'partial', diy: 'yes' },
  { feature: 'Funding-readiness visibility', sl: 'yes', tools: 'partial', brokers: 'partial', diy: 'no' },
  { feature: 'Ongoing monthly support', sl: 'yes', tools: 'no', brokers: 'partial', diy: 'no' },
  { feature: 'AI-powered tools', sl: 'yes', tools: 'no', brokers: 'no', diy: 'no' },
  { feature: 'Document organization', sl: 'yes', tools: 'no', brokers: 'no', diy: 'no' },
  { feature: 'Progress tracking', sl: 'yes', tools: 'partial', brokers: 'no', diy: 'no' },
  { feature: 'Built for business owners', sl: 'yes', tools: 'partial', brokers: 'yes', diy: 'partial' },
  { feature: 'Cancel anytime plans', sl: 'yes', tools: 'yes', brokers: 'no', diy: 'yes' },
]

const PLAN_GUIDE = [
  {
    step: '1',
    label: 'Free',
    desc: 'Run the analyzer and get an instant snapshot of where your business stands.',
    color: 'bg-green-700 text-white',
  },
  {
    step: '2',
    label: 'Program C',
    desc: 'Stay visible with ongoing monitoring and know your funding readiness at all times.',
    color: 'bg-green-700 text-white',
  },
  {
    step: '3',
    label: 'Program B',
    desc: 'Actively build your business credit profile with guided workflow and milestone tracking.',
    color: 'bg-green-100 text-green-700',
  },
  {
    step: '4',
    label: 'Program A',
    desc: 'Re-optimize your personal credit and build a 0% intro APR card strategy for business funding capital.',
    color: 'bg-green-600 text-white',
  },
]

const BUNDLE = {
  label: 'Program A + B',
  title: 'Business + Personal Credit Strategy',
  price: '$598',
  period: '/month',
  description: 'Run both programs simultaneously - build your business credit under your EIN while re-optimizing your personal credit and deploying a 0% APR card strategy at the same time.',
  features: [
    'Business credit building workflow',
    'Personal credit re-optimization',
    '0% intro APR card strategy',
    'Vendor and tradeline strategy',
    'Document organization and milestones',
    'Progress tracking across both programs',
    'Guided funding readiness support',
  ],
  cta: 'Contact Us',
  href: '/contact',
  footer: 'Not yet available for self-serve checkout',
} as const

function Check({ value }: { value: CheckValue }) {
  if (value === 'yes') return <CheckCircle size={17} className="text-green-500 mx-auto" aria-label="Yes" />
  if (value === 'partial') return <Minus size={17} className="text-gray-400 mx-auto" aria-label="Limited" />
  return <X size={17} className="text-gray-300 mx-auto" aria-label="No" />
}

interface PricingPageProps {
  searchParams?: Promise<{ sl_locale?: string }>
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = searchParams ? await searchParams : {}
  const locale = normalizeLocale(params.sl_locale ?? cookies().get(LOCALE_COOKIE)?.value)
  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  const localizedPlans = PLANS.map((plan) => ({
    ...plan,
    href: localizeHref(plan.href, locale),
    badge: text(
      plan.badge,
      plan.id === 'free' ? 'Gratis' : plan.id === 'program_c' ? 'Programa C' : plan.id === 'program_b' ? 'Programa B' : 'Programa A',
    ),
    title: text(
      plan.title,
      plan.id === 'free' ? 'Gratis' : plan.id === 'program_c' ? 'Monitoreo de capital' : plan.id === 'program_b' ? 'Constructor de credito empresarial' : 'Estrategia de tarjetas con APR 0%',
    ),
    period: text(plan.period, '/mes'),
    description: text(
      plan.description,
      plan.id === 'free'
        ? 'Empieza con el analizador gratis y mira donde esta tu negocio.'
        : plan.id === 'program_c'
          ? 'Supervisa tu perfil de credito empresarial, sigue el progreso y mantenete listo para financiamiento.'
          : plan.id === 'program_b'
            ? 'Construye activamente tu perfil de credito empresarial bajo tu EIN con un flujo guiado y herramientas estructuradas.'
            : 'Reoptimiza tu credito personal y aplica una estrategia de tarjetas con APR introductorio 0% para acceder a capital de financiamiento empresarial.',
    ),
    features: plan.features.map((feature) => {
      const esMap: Record<string, string> = {
        'Free business credit analyzer': 'Analizador gratis de credito empresarial',
        'Instant readiness score': 'Puntuacion instantanea de preparacion',
        'Personalized recommendations': 'Recomendaciones personalizadas',
        'No credit card required': 'No se requiere tarjeta de credito',
        'Client portal access': 'Acceso al portal del cliente',
        'Business credit monitoring dashboard': 'Panel de monitoreo de credito empresarial',
        'Funding readiness score': 'Puntuacion de preparacion para financiamiento',
        'Monthly progress reports': 'Reportes mensuales de progreso',
        'AI-assisted credit analysis': 'Analisis de credito asistido por IA',
        'Free business credit analyzer included': 'Incluye analizador gratis de credito empresarial',
        'Guided business credit building workflow': 'Flujo guiado para construir credito empresarial',
        'Vendor and tradeline strategy': 'Estrategia de proveedores y tradelines',
        'Business credit profile development': 'Desarrollo del perfil de credito empresarial',
        'Document organization and milestones': 'Organizacion de documentos e hitos',
        'Task management and progress tracking': 'Gestion de tareas y seguimiento del progreso',
        'Personal credit review and re-optimization': 'Revision y reoptimizacion de credito personal',
        'Credit report review and dispute workflow': 'Revision de informes y flujo de disputas',
        '0% intro APR card strategy': 'Estrategia de tarjetas con APR introductorio 0%',
        'Card sequencing and optimization': 'Secuenciacion y optimizacion de tarjetas',
        'Personal credit readiness for funding': 'Preparacion de credito personal para financiamiento',
        'Business credit building workflow': 'Flujo para construir credito empresarial',
        'Personal credit re-optimization': 'Reoptimizacion de credito personal',
        'Guided funding readiness support': 'Apoyo guiado para preparacion de financiamiento',
      }
      return text(feature, esMap[feature] ?? feature)
    }),
    cta: text(plan.cta, plan.id === 'free' ? 'Abrir analizador gratis' : 'Comenzar prueba gratis de 3 dias'),
    footer: plan.footer ? text(plan.footer, 'No hay cargo hoy.') : null,
  }))

  const localizedBundle = {
    label: text('Program A + B', 'Programa A + B'),
    title: text('Business + Personal Credit Strategy', 'Estrategia de credito empresarial y personal'),
    price: '$598',
    period: text('/month', '/mes'),
    description: text(
      BUNDLE.description,
      'Ejecuta ambos programas al mismo tiempo: construye tu credito empresarial bajo tu EIN mientras reoptimizas tu credito personal y aplicas una estrategia de tarjetas con APR 0% al mismo tiempo.',
    ),
    features: BUNDLE.features.map((feature) => {
      const esMap: Record<string, string> = {
        'Business credit building workflow': 'Flujo para construir credito empresarial',
        'Personal credit re-optimization': 'Reoptimizacion de credito personal',
        '0% intro APR card strategy': 'Estrategia de tarjetas con APR introductorio 0%',
        'Vendor and tradeline strategy': 'Estrategia de proveedores y tradelines',
        'Document organization and milestones': 'Organizacion de documentos e hitos',
        'Progress tracking across both programs': 'Seguimiento de progreso en ambos programas',
        'Guided funding readiness support': 'Apoyo guiado para preparacion de financiamiento',
      }
      return text(feature, esMap[feature] ?? feature)
    }),
    cta: text(BUNDLE.cta, 'Contactanos'),
    footer: text(BUNDLE.footer, 'Aun no disponible para pago autoservicio'),
    href: localizeHref(BUNDLE.href, locale),
  }

  const localizedComparisonRows = [
    { feature: text('Free analyzer', 'Analizador gratis'), sl: 'yes' as CheckValue, tools: 'yes' as CheckValue, brokers: 'no' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Client portal access', 'Acceso al portal del cliente'), sl: 'yes' as CheckValue, tools: 'no' as CheckValue, brokers: 'no' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Guided credit-building workflow', 'Flujo guiado para construir credito'), sl: 'yes' as CheckValue, tools: 'no' as CheckValue, brokers: 'partial' as CheckValue, diy: 'yes' as CheckValue },
    { feature: text('Funding-readiness visibility', 'Visibilidad de preparacion para financiamiento'), sl: 'yes' as CheckValue, tools: 'partial' as CheckValue, brokers: 'partial' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Ongoing monthly support', 'Soporte mensual continuo'), sl: 'yes' as CheckValue, tools: 'no' as CheckValue, brokers: 'partial' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('AI-powered tools', 'Herramientas impulsadas por IA'), sl: 'yes' as CheckValue, tools: 'no' as CheckValue, brokers: 'no' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Document organization', 'Organizacion de documentos'), sl: 'yes' as CheckValue, tools: 'no' as CheckValue, brokers: 'no' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Progress tracking', 'Seguimiento de progreso'), sl: 'yes' as CheckValue, tools: 'partial' as CheckValue, brokers: 'no' as CheckValue, diy: 'no' as CheckValue },
    { feature: text('Built for business owners', 'Disenado para duenos de negocios'), sl: 'yes' as CheckValue, tools: 'partial' as CheckValue, brokers: 'yes' as CheckValue, diy: 'partial' as CheckValue },
    { feature: text('Cancel anytime plans', 'Planes cancelables en cualquier momento'), sl: 'yes' as CheckValue, tools: 'yes' as CheckValue, brokers: 'no' as CheckValue, diy: 'yes' as CheckValue },
  ]

  const localizedComparisonHeaders = {
    feature: text('Feature', 'Funcion'),
    monitoring: text('Credit Monitoring', 'Monitoreo de credito'),
    brokers: text('Brokers', 'Brokers'),
    diy: text('DIY Courses', 'Cursos DIY'),
    yes: text('Yes', 'Si'),
    limited: text('Limited or varies', 'Limitado o variable'),
    no: text('Not included', 'No incluido'),
    note: text(
      "Comparisons are general and may not reflect every provider's current offerings.",
      'Las comparaciones son generales y pueden no reflejar todas las ofertas actuales de cada proveedor.',
    ),
  }

  const localizedPlanGuide = [
    { step: '1', label: text('Free', 'Gratis'), desc: text('Run the analyzer and get an instant snapshot of where your business stands.', 'Ejecuta el analizador y obten una vista instantanea de donde esta tu negocio.'), color: 'bg-green-700 text-white' },
    { step: '2', label: text('Program C', 'Programa C'), desc: text('Stay visible with ongoing monitoring and know your funding readiness at all times.', 'Manten visibilidad con monitoreo continuo y conoce tu preparacion para financiamiento en todo momento.'), color: 'bg-green-700 text-white' },
    { step: '3', label: text('Program B', 'Programa B'), desc: text('Actively build your business credit profile with guided workflow and milestone tracking.', 'Construye activamente tu perfil de credito empresarial con flujo guiado y seguimiento de hitos.'), color: 'bg-green-100 text-green-700' },
    { step: '4', label: text('Program A', 'Programa A'), desc: text('Re-optimize your personal credit and build a 0% intro APR card strategy for business funding capital.', 'Reoptimiza tu credito personal y crea una estrategia de tarjetas con APR introductorio 0% para capital de financiamiento empresarial.'), color: 'bg-green-600 text-white' },
  ]

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <Link href={localizeHref('/', locale)} className="flex items-center gap-2 min-w-0 shrink" prefetch={false}>
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">SL</span>
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 truncate whitespace-nowrap">SourcifyLending</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link href={localizeHref('/partners', locale)} className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline" prefetch={false}>
            {text('Partners', 'Socios')}
          </Link>
          <Link href={portalSignInHref(locale)} className="brand-link text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 whitespace-nowrap" prefetch={false}>
            {text('Sign In', 'Ingresar')}
          </Link>
          <Link href={localizeHref('/analyzer', locale)} className="btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap" prefetch={false}>
            {text('Free Analyzer', 'Analizador gratis')}
          </Link>
          <LanguageToggle />
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 pb-10 text-center">
        <div className="mb-4">
          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
            {text('Start Risk-Free', 'Empieza sin riesgo')}
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-4">
          {text('Start Your ', 'Comienza tu ')}
          <span className="text-green-600">{text('3-Day Free Trial', 'prueba gratis de 3 dias')}</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          {text('Test any plan. Cancel anytime. No charge today.', 'Prueba cualquier plan. Cancela cuando quieras. No hay cargo hoy.')}
        </p>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {localizedPlans.map((plan) => {
            const isDark = plan.id === 'program_a' || plan.id === 'program_c'
            return (
              <div key={plan.id} className={`rounded-2xl p-6 flex flex-col ${plan.style.card}`}>
                <div className="mb-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${plan.style.badge}`}>
                    {plan.badge}
                  </span>
                </div>

                <h2 className={`font-bold text-base mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {plan.title}
                </h2>
                <div className="flex items-baseline gap-0.5 mb-3">
                  <span className={`text-4xl font-bold ${plan.style.price}`}>{plan.price}</span>
                  <span className={`text-sm ${isDark ? 'text-green-200' : 'text-gray-400'}`}>{plan.period}</span>
                </div>
                <p className={`text-sm mb-5 leading-relaxed ${isDark ? 'text-green-100' : 'text-gray-500'}`}>
                  {plan.description}
                </p>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className={`flex items-start gap-2 text-sm ${isDark ? 'text-green-50' : 'text-gray-600'}`}>
                      <CheckCircle
                        size={15}
                        className={`shrink-0 mt-0.5 ${isDark ? 'text-green-300' : 'text-green-500'}`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link href={plan.href} className={plan.style.cta} prefetch={false}>
                  {plan.cta} <ArrowRight size={15} />
                </Link>

                {plan.id !== 'free' && (
                  <p className={`text-xs text-center mt-3 ${isDark ? 'text-green-200' : 'text-gray-400'}`}>
                    {plan.footer}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <div className="rounded-2xl border-2 border-green-500 bg-green-600 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-7 sm:p-8">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500 text-white">
                  {localizedBundle.label}
                </span>
                <span className="text-green-300 text-xs font-medium">Bundle - Both Programs Together</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">{localizedBundle.title}</h2>
              <p className="text-green-100 text-sm leading-relaxed mb-6">{localizedBundle.description}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {localizedBundle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-green-50">
                    <CheckCircle size={14} className="text-green-300 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-green-700/50 p-7 sm:p-8 flex flex-col justify-center items-start md:items-center md:text-center gap-5 border-t-2 md:border-t-0 md:border-l-2 border-green-500/40">
              <div>
                <p className="text-green-300 text-xs font-semibold uppercase tracking-wide mb-1">Bundle Price</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">{localizedBundle.price}</span>
                  <span className="text-green-200 text-sm">{localizedBundle.period}</span>
                </div>
                <p className="text-green-300 text-xs mt-1">Program A + B combined</p>
              </div>
              <Link
                href={localizedBundle.href}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-6 py-3 rounded-xl border border-slate-700 transition-colors duration-150 inline-flex items-center justify-center gap-2 text-sm w-full md:w-auto"
              >
                {localizedBundle.cta} <ArrowRight size={15} />
              </Link>
              <p className="text-green-300 text-xs">{localizedBundle.footer}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              {text('Why Business Owners Choose SourcifyLending', 'Por que los duenos de negocios eligen SourcifyLending')}
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-sm sm:text-base">
              {text(
                'SourcifyLending is built for business owners who want more than just a report or a course. The platform combines visibility, workflow, and ongoing guidance in one place.',
                'SourcifyLending esta disenado para duenos de negocios que quieren mas que un informe o un curso. La plataforma combina visibilidad, flujo de trabajo y orientacion continua en un solo lugar.',
              )}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-700/40">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-700/40">
                  <th className="text-left px-5 py-4 text-gray-500 font-medium w-[38%]">{localizedComparisonHeaders.feature}</th>
                  <th className="px-4 py-4 text-center w-[15%]">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">
                      SourcifyLending
                    </span>
                  </th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[16%] text-xs">{localizedComparisonHeaders.monitoring}</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[15%] text-xs">{localizedComparisonHeaders.brokers}</th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[15%] text-xs">{localizedComparisonHeaders.diy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {localizedComparisonRows.map((row) => (
                  <tr key={row.feature} className="hover:bg-green-500/5 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-300">{row.feature}</td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.sl} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.tools} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.brokers} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.diy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-5 mt-4 justify-center flex-wrap text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle size={13} className="text-green-500" /> {localizedComparisonHeaders.yes}
            </span>
            <span className="flex items-center gap-1.5">
              <Minus size={13} className="text-gray-400" /> {localizedComparisonHeaders.limited}
            </span>
            <span className="flex items-center gap-1.5">
              <X size={13} className="text-gray-300" /> {localizedComparisonHeaders.no}
            </span>
            <span className="text-gray-300">.</span>
            <span className="text-gray-400">{localizedComparisonHeaders.note}</span>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{text('Which Plan Is Right for You?', 'Que plan es el adecuado para ti?')}</h2>
        <p className="text-gray-500 text-center text-sm mb-10">
          {text('Every plan starts with the free analyzer. Upgrade when your goals require it.', 'Todos los planes comienzan con el analizador gratis. Actualiza cuando tus objetivos lo requieran.')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {localizedPlanGuide.map((guide) => (
            <div key={guide.step} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mb-3 ${guide.color}`}>
                {guide.step}
              </div>
              <div className="font-semibold text-gray-900 text-sm mb-1.5">{guide.label}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{guide.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-green-600 py-14 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-3">{text('Start with the free analyzer', 'Empieza con el analizador gratis')}</h2>
          <p className="text-green-200 mb-8 text-base">
            {text('No credit card required. See your business credit readiness in minutes.', 'No se requiere tarjeta de credito. Ve tu preparacion de credito empresarial en minutos.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={localizeHref('/analyzer', locale)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-8 py-4 rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-2 text-base"
              prefetch={false}
            >
              {text('Run Free Analyzer', 'Abrir analizador gratis')} <ArrowRight size={18} />
            </Link>
            <Link
              href={portalSignInHref(locale)}
              className="border border-green-400 hover:bg-green-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-2 text-base"
              prefetch={false}
            >
              {text('Sign Into Portal', 'Ingresar al portal')}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 px-6 pb-12 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400">
          <span className="font-medium text-gray-500">SourcifyLending</span>
          <Link href={localizeHref('/pricing', locale)} className="hover:text-green-600 transition-colors" prefetch={false}>{text('Pricing', 'Precios')}</Link>
          <Link href={localizeHref('/partners', locale)} className="hover:text-green-600 transition-colors" prefetch={false}>{text('Partners', 'Socios')}</Link>
          <Link href={localizeHref('/privacy', locale)} className="hover:text-green-600 transition-colors" prefetch={false}>{text('Privacy Policy', 'Politica de privacidad')}</Link>
          <Link href={localizeHref('/terms', locale)} className="hover:text-green-600 transition-colors" prefetch={false}>{text('Terms of Service', 'Terminos de servicio')}</Link>
          <Link href={portalSignInHref(locale)} className="hover:text-green-600 transition-colors" prefetch={false}>{text('Sign In', 'Ingresar')}</Link>
        </div>
      </footer>
    </div>
  )
}
