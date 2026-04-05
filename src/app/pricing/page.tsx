import Link from 'next/link'
import { CheckCircle, X, Minus, ArrowRight } from 'lucide-react'

// ─── Data ─────────────────────────────────────────────────────────────────────

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
    cta: 'Get Started Free',
    href: '/get-started',
    footer: null,
    style: {
      card: 'border border-gray-200 bg-white',
      badge: 'bg-gray-100 text-gray-600',
      price: 'text-gray-900',
      cta: 'btn-secondary w-full',
    },
  },
  {
    id: 'program_c',
    badge: 'Program C',
    title: 'Capital Monitoring',
    price: '$97',
    period: '/month',
    description: 'Monitor your business credit, track progress, and stay funding-ready.',
    features: [
      'Everything in Free',
      'Business credit monitoring dashboard',
      'Funding readiness score',
      'Monthly progress reports',
      'AI-assisted credit analysis',
      'Client portal access',
    ],
    cta: 'Start Program C',
    href: '/get-started',
    footer: 'First month due at signup · Cancel anytime',
    style: {
      card: 'border border-green-200 bg-white',
      badge: 'bg-green-50 text-green-700',
      price: 'text-gray-900',
      cta: 'btn-secondary w-full',
    },
  },
  {
    id: 'program_b',
    badge: 'Program B',
    title: 'Business Credit Builder',
    price: '$249',
    period: '/month',
    description: 'Build your business credit profile with a guided workflow and structured tools.',
    features: [
      'Everything in Program C',
      'Business credit building workflow',
      'Vendor account sequencing',
      'Tradeline strategy guidance',
      'Document organization',
      'Task management & milestones',
    ],
    cta: 'Start Program B',
    href: '/get-started',
    footer: 'First month due at signup · Cancel anytime',
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
    description: 'For businesses ready to leverage 0% intro APR business credit cards for growth capital.',
    features: [
      'Everything in Program B',
      '0% intro APR card strategy',
      'Card sequencing optimization',
      'High-limit card targeting',
      'Funding-readiness roadmap',
      'Priority platform access',
    ],
    cta: 'Start Program A',
    href: '/get-started',
    footer: 'First month due at signup · Cancel anytime',
    style: {
      card: 'border-2 border-green-600 bg-green-600',
      badge: 'bg-green-500 text-white',
      price: 'text-white',
      cta: 'bg-white hover:bg-green-50 text-green-700 font-semibold px-5 py-3 rounded-xl border border-white/20 transition-colors duration-150 inline-flex items-center justify-center gap-2 text-sm w-full',
    },
  },
] as const

type CheckValue = 'yes' | 'partial' | 'no'

const COMPARISON_ROWS: { feature: string; sl: CheckValue; tools: CheckValue; brokers: CheckValue; diy: CheckValue }[] = [
  { feature: 'Free analyzer',                  sl: 'yes',     tools: 'yes',     brokers: 'no',      diy: 'no'      },
  { feature: 'Client portal access',           sl: 'yes',     tools: 'no',      brokers: 'no',      diy: 'no'      },
  { feature: 'Guided credit-building workflow',sl: 'yes',     tools: 'no',      brokers: 'partial',  diy: 'yes'     },
  { feature: 'Funding-readiness visibility',   sl: 'yes',     tools: 'partial', brokers: 'partial',  diy: 'no'      },
  { feature: 'Ongoing monthly support',        sl: 'yes',     tools: 'no',      brokers: 'partial',  diy: 'no'      },
  { feature: 'AI-powered tools',               sl: 'yes',     tools: 'no',      brokers: 'no',      diy: 'no'      },
  { feature: 'Document organization',          sl: 'yes',     tools: 'no',      brokers: 'no',      diy: 'no'      },
  { feature: 'Progress tracking',              sl: 'yes',     tools: 'partial', brokers: 'no',      diy: 'no'      },
  { feature: 'Built for business owners',      sl: 'yes',     tools: 'partial', brokers: 'yes',     diy: 'partial' },
  { feature: 'Cancel anytime plans',           sl: 'yes',     tools: 'yes',     brokers: 'no',      diy: 'yes'     },
]

const PLAN_GUIDE = [
  {
    step: '1',
    label: 'Free',
    desc: 'Run the analyzer and get an instant snapshot of where your business stands.',
    color: 'bg-gray-100 text-gray-600',
  },
  {
    step: '2',
    label: 'Program C',
    desc: 'Stay visible with ongoing monitoring and know your funding readiness at all times.',
    color: 'bg-green-50 text-green-700',
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
    desc: 'Deploy 0% intro APR business credit cards as growth capital with expert sequencing.',
    color: 'bg-green-600 text-white',
  },
]

// ─── Check Icon ───────────────────────────────────────────────────────────────

function Check({ value }: { value: CheckValue }) {
  if (value === 'yes') return <CheckCircle size={17} className="text-green-500 mx-auto" aria-label="Yes" />
  if (value === 'partial') return <Minus size={17} className="text-gray-400 mx-auto" aria-label="Limited" />
  return <X size={17} className="text-gray-300 mx-auto" aria-label="No" />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2 min-w-0 shrink">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">SL</span>
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 truncate whitespace-nowrap">SourcifyLending</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link href="/partners" className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline">
            Partners
          </Link>
          <Link href="/pricing" className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="brand-link text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 whitespace-nowrap">
            Sign In
          </Link>
          <Link href="/get-started" className="btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap">
            Get Started
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Start free. Upgrade when you&apos;re ready. No setup fees. No long-term contracts.
        </p>
      </section>

      {/* ── Pricing Cards ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {PLANS.map((plan) => {
            const isDark = plan.id === 'program_a'
            return (
              <div key={plan.id} className={`rounded-2xl p-6 flex flex-col ${plan.style.card}`}>

                {/* Badge */}
                <div className="mb-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${plan.style.badge}`}>
                    {plan.badge}
                  </span>
                </div>

                {/* Title & price */}
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

                {/* Features */}
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${isDark ? 'text-green-50' : 'text-gray-600'}`}>
                      <CheckCircle
                        size={15}
                        className={`shrink-0 mt-0.5 ${isDark ? 'text-green-300' : 'text-green-500'}`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link href={plan.href} className={plan.style.cta}>
                  {plan.cta} <ArrowRight size={15} />
                </Link>

                {/* Footer note */}
                {plan.footer && (
                  <p className={`text-xs text-center mt-3 ${isDark ? 'text-green-200' : 'text-gray-400'}`}>
                    {plan.footer}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Comparison ──────────────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              Why Business Owners Choose SourcifyLending
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-sm sm:text-base">
              SourcifyLending is built for business owners who want more than just a report or a course.
              The platform combines visibility, workflow, and ongoing guidance in one place.
            </p>
          </div>

          {/* Table — scrollable on small screens */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-4 text-gray-500 font-medium w-[38%]">Feature</th>
                  <th className="px-4 py-4 text-center w-[15%]">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      SourcifyLending
                    </span>
                  </th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[15%] text-xs">
                    Credit Monitoring Tools
                  </th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[15%] text-xs">
                    Funding Brokers
                  </th>
                  <th className="px-4 py-4 text-center text-gray-500 font-medium w-[15%] text-xs">
                    DIY Courses
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                    <td className="px-5 py-3.5 text-gray-700 font-medium">{row.feature}</td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.sl} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.tools} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.brokers} /></td>
                    <td className="px-4 py-3.5 text-center"><Check value={row.diy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-4 justify-center flex-wrap text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle size={13} className="text-green-500" /> Yes
            </span>
            <span className="flex items-center gap-1.5">
              <Minus size={13} className="text-gray-400" /> Limited or varies
            </span>
            <span className="flex items-center gap-1.5">
              <X size={13} className="text-gray-300" /> Not included
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">Comparisons are general and may not reflect every provider&apos;s current offerings.</span>
          </div>
        </div>
      </section>

      {/* ── Plan Guide ──────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Which Plan Is Right for You?</h2>
        <p className="text-gray-500 text-center text-sm mb-10">
          Every plan starts with the free analyzer. Upgrade when your goals require it.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLAN_GUIDE.map((g) => (
            <div key={g.step} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mb-3 ${g.color}`}>
                {g.step}
              </div>
              <div className="font-semibold text-gray-900 text-sm mb-1.5">{g.label}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="bg-green-600 py-14 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-3">Start with the free analyzer</h2>
          <p className="text-green-200 mb-8 text-base">
            No credit card required. See your business credit readiness in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/get-started"
              className="bg-white hover:bg-green-50 text-green-700 font-semibold px-8 py-4 rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-2 text-base"
            >
              Get Started Free <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="border border-green-400 hover:bg-green-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors duration-150 inline-flex items-center justify-center gap-2 text-base"
            >
              Sign Into Portal
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400">
          <span className="font-medium text-gray-500">SourcifyLending</span>
          <Link href="/pricing" className="hover:text-green-600 transition-colors">Pricing</Link>
          <Link href="/partners" className="hover:text-green-600 transition-colors">Partners</Link>
          <Link href="/privacy" className="hover:text-green-600 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-green-600 transition-colors">Terms of Service</Link>
          <Link href="/login" className="hover:text-green-600 transition-colors">Sign In</Link>
        </div>
      </footer>

    </div>
  )
}
