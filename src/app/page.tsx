import Link from 'next/link'
import { ArrowRight, CheckCircle, Bot, BarChart2, Shield, Users, DollarSign } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SL</span>
          </div>
          <span className="font-bold text-gray-900">SourcifyLending</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/partners" className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-2 hidden sm:inline">
            Affiliates
          </Link>
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2">
            Sign In
          </Link>
          <Link href="/analyzer" className="btn-primary text-sm px-4 py-2.5">
            Free Analyzer
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Bot size={16} />
          AI-Powered Credit Fulfillment Platform
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Build Business Credit<br />
          <span className="text-green-600">With AI Guiding Every Step</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
          SourcifyLending's AI fulfillment agent manages your entire credit-building journey —
          from initial analysis to tradeline reporting, card acquisition, and funding readiness.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/analyzer" className="btn-primary text-base px-8 py-4">
            Run Free Analyzer <ArrowRight size={18} />
          </Link>
          <Link href="/login" className="btn-secondary text-base px-8 py-4">
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

      {/* ── AFFILIATE CTA SECTION ── */}
      <section className="bg-gray-50 py-16 px-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left — copy */}
              <div className="p-8 sm:p-10 flex flex-col justify-center">
                <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 w-fit">
                  <Users size={13} />
                  Affiliate Program
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-snug">
                  Refer Clients.<br />Earn Recurring Commissions.
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  Help business owners discover SourcifyLending and earn 30% of setup fees plus
                  20% of every monthly payment they make — for as long as they stay active.
                </p>
                <ul className="space-y-2 mb-8">
                  {[
                    '30% commission on setup fees',
                    '20% recurring monthly commission',
                    'Real-time referral and earnings tracking',
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
                    Become an Affiliate <ArrowRight size={16} />
                  </Link>
                  <Link href="/partners#how-it-works" className="btn-secondary text-sm px-6 py-3">
                    Learn More
                  </Link>
                </div>
              </div>

              {/* Right — stats */}
              <div className="bg-green-600 p-8 sm:p-10 flex flex-col justify-center gap-6">
                {[
                  {
                    icon: DollarSign,
                    label: 'Program A referral — Year 1',
                    value: '$1,407+',
                    sub: '30% setup + 20% recurring',
                  },
                  {
                    icon: DollarSign,
                    label: 'Program B referral — Year 1',
                    value: '$777+',
                    sub: '30% setup + 20% recurring',
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
                      <p className="text-green-200 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg leading-tight">{value}</p>
                      <p className="text-green-300 text-xs">{sub}</p>
                    </div>
                  </div>
                ))}
                <p className="text-green-300 text-xs mt-2">
                  Estimates based on a single active referral per program. Actual earnings vary. No income guaranteed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-14 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <Shield size={36} className="text-green-200 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-3">
            Find Out Where You Stand — Free
          </h2>
          <p className="text-green-200 mb-8 text-lg">
            Complete the 12-question analyzer and get your program recommendation in under 3 minutes.
          </p>
          <Link href="/analyzer" className="inline-flex items-center gap-2 bg-white text-green-600 font-bold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors text-base">
            Start Free Analyzer <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} SourcifyLending. Results are not guaranteed. This platform does not promise approvals, specific credit limits, or funding outcomes.
          </p>
          <div className="flex items-center gap-5 text-sm text-gray-400">
            <Link href="/analyzer" className="hover:text-gray-600 transition-colors">Free Analyzer</Link>
            <Link href="/login" className="hover:text-gray-600 transition-colors">Client Login</Link>
            <Link href="/partners" className="hover:text-gray-600 transition-colors font-medium text-green-600">
              Become an Affiliate
            </Link>
            <Link href="/affiliate/login" className="hover:text-gray-600 transition-colors">Affiliate Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
