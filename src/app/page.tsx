import Link from 'next/link'
import { ArrowRight, CheckCircle, Bot, BarChart2, Shield, Users, DollarSign } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs sm:text-sm">SL</span>
          </div>
          <span className="font-bold text-sm sm:text-base text-gray-900 truncate whitespace-nowrap">SourcifyLending</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link href="/partners" className="brand-link text-sm font-medium px-3 py-2 hidden sm:inline">
            Partners
          </Link>
          <Link href="/pricing" className="brand-link text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 whitespace-nowrap">
            Pricing
          </Link>
          <Link href="/sign-in" className="brand-link text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 whitespace-nowrap hidden sm:inline">
            Sign In
          </Link>
          <Link href="/analyzer" className="btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap">
            Free Analyzer
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm mb-6">
          <Bot size={16} className="text-white" />
          AI-Powered Credit Fulfillment Platform
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Build Business Credit<br />
          <span className="text-white">With AI Guiding Every Step</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
          SourcifyLending&apos;s AI fulfillment agent manages your entire credit-building journey —
          from initial analysis to tradeline reporting, card acquisition, and funding readiness.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/analyzer" className="btn-primary text-base px-8 py-4">
            Free Analyzer <ArrowRight size={18} />
          </Link>
          <Link href="/sign-in" className="btn-secondary text-base px-8 py-4">
            Sign Into Portal
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Everything You Need to Build Business Credit
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Bot,
                title: 'AI Fulfillment Agent',
                desc: 'Your personal AI guides you through every stage, answers questions, reviews uploads, and keeps you on track.',
                color: 'bg-green-100 text-green-600',
              },
              {
                icon: CheckCircle,
                title: 'Structured Task Manager',
                desc: 'Step-by-step roadmap with tracked tasks, due dates, and stage progression — like Asana for credit building.',
                color: 'bg-green-100 text-green-600',
              },
              {
                icon: BarChart2,
                title: 'Reports & Deliverables',
                desc: 'AI-generated credit readiness summaries, tradeline reports, and monthly monitoring delivered inside your portal.',
                color: 'bg-blue-100 text-blue-600',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
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

      {/* Programs */}
      <section className="py-16 px-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">Three Specialized Programs</h2>
        <p className="text-gray-500 text-center mb-10">The analyzer assigns you to the right program based on your profile.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              badge: 'Program A',
              title: '0% Intro APR Card Strategy',
              desc: 'For businesses ready to leverage 0% intro APR business credit cards as low-cost capital.',
              features: ['Credit readiness review', 'Card sequencing strategy', 'Application timing guidance', 'Optimization tracking'],
              color: 'border-green-200 bg-green-50/40',
              badgeColor: 'bg-green-100 text-green-700',
            },
            {
              badge: 'Program B',
              title: 'Business Credit Builder',
              desc: 'Build your business credit under your EIN through a structured tradeline sequence.',
              features: ['Entity & EIN setup', 'Vendor net-30 accounts', 'Store & fleet credit', 'Cash credit readiness'],
              color: 'border-emerald-200 bg-emerald-50/40',
              badgeColor: 'bg-emerald-100 text-emerald-700',
            },
            {
              badge: 'Program C',
              title: 'Capital Monitoring',
              desc: 'Monthly oversight, credit snapshots, and action plans to stay funding-ready.',
              features: ['Monthly credit snapshot', 'Banking analysis', 'Risk scan', '30-day action plan'],
              color: 'border-blue-200 bg-blue-50/40',
              badgeColor: 'bg-blue-100 text-blue-700',
            },
          ].map(({ badge, title, desc, features, color, badgeColor }) => (
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

      {/* ── PARTNER CTA SECTION ── */}
      <section className="bg-gray-50 py-16 px-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left — copy */}
              <div className="p-8 sm:p-10 flex flex-col justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-green-600 bg-green-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm mb-5 w-fit">
                  <Users size={13} className="text-white" />
                  Partner Program
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-snug">
                  Close, onboard, and manage clients.<br />Use SourcifyLending as the platform.
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-5">
                  This is a partner-assisted model, not a passive referral program. Partners bring in the client,
                  close the client, onboard the client, and stay the frontline relationship owner while
                  SourcifyLending powers the infrastructure behind the scenes.
                </p>

                {/* Partner compensation cards */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Program A / B / A+B Setup</p>
                    <p className="text-xl font-bold text-gray-900">80%</p>
                    <p className="text-xs text-gray-500 mt-0.5">Collected setup fee payout</p>
                  </div>
                  <div className="rounded-xl border border-green-500 bg-green-700 p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-white/85 uppercase tracking-wide mb-1">Monthly Revenue</p>
                    <p className="text-xl font-bold text-white">20%</p>
                    <p className="text-xs text-white/80 mt-0.5">Successful collected recurring revenue</p>
                  </div>
                </div>

                <ul className="space-y-2 mb-8">
                  {[
                    'Partner-assisted clients can carry setup fees for A, B, and A+B because onboarding help is included',
                    'Track partner clients, onboarding progress, and collected earnings from your portal',
                    'Add and invite clients directly from your partner portal',
                    'Unlock free Program B access at 5 active clients',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/partners" className="btn-primary text-sm px-6 py-3">
                    Become a Partner <ArrowRight size={16} />
                  </Link>
                  <Link href="/partners#how-it-works" className="btn-secondary text-sm px-6 py-3">
                    Learn More
                  </Link>
                </div>
              </div>

              {/* Right — earnings examples */}
              <div className="bg-green-600 p-8 sm:p-10 flex flex-col justify-center gap-6">
                {[
                  {
                    icon: DollarSign,
                    label: 'Program A partner-assisted',
                    value: '$400 setup + $89.80/mo',
                    sub: '80% of setup + 20% recurring',
                  },
                  {
                    icon: DollarSign,
                    label: 'Program B partner-assisted',
                    value: '$240 setup + $49.80/mo',
                    sub: '80% of setup + 20% recurring',
                  },
                  {
                    icon: DollarSign,
                    label: 'Program A + B partner-assisted',
                    value: '$640 setup + $119.60/mo',
                    sub: '80% of setup + 20% recurring',
                  },
                  {
                    icon: Users,
                    label: 'Free Program B access after',
                    value: '5 active clients',
                    sub: 'Maintained for 14 consecutive days',
                  },
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
                  Partner compensation is earned only on partner-assisted clients you close and onboard. No payout on failed, refunded, disputed, or reversed payments.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-14 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <Shield size={36} className="text-white mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-3">
            Find Out Where You Stand — Free
          </h2>
          <p className="text-white/90 mb-8 text-lg">
            Complete the 12-question analyzer and get your program recommendation in under 3 minutes.
          </p>
          <Link href="/analyzer" className="inline-flex items-center gap-2 bg-white text-green-600 font-bold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors text-base">
            Run Free Analyzer <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} SourcifyLending. Results are not guaranteed. This platform does not promise approvals, specific credit limits, or funding outcomes.
          </p>
          <div className="flex flex-wrap items-center gap-5 text-sm text-gray-400">
            <Link href="/analyzer" className="brand-link-muted">Free Analyzer</Link>
            <Link href="/pricing" className="brand-link-muted">Pricing</Link>
            <Link href="/sign-in" className="brand-link-muted">Client Login</Link>
            <Link href="/privacy" className="brand-link-muted">Privacy</Link>
            <Link href="/terms" className="brand-link-muted">Terms</Link>
            <Link href="/partners" className="font-medium text-green-600 transition-colors hover:text-green-700">
              Become a Partner
            </Link>
            <Link href="/affiliate/login" className="brand-link-muted">Partner Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
