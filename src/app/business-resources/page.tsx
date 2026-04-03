import PortalLayout from '@/components/layout/PortalLayout'
import { getProgramShortLabel } from '@/lib/utils'
import { BookOpen, Phone, Globe, Mail, MapPin, Building, Star, Briefcase } from 'lucide-react'
import { requirePortalPageContext } from '@/lib/business-context'

export const dynamic = 'force-dynamic'

const RESOURCE_SECTIONS = [
  {
    title: 'Business Phone & Listings',
    icon: Phone,
    items: [
      { name: 'Google Voice', desc: 'Free dedicated business number with voicemail and forwarding', url: 'https://voice.google.com', badge: 'Free' },
      { name: 'Grasshopper', desc: 'Professional virtual phone system for small businesses', url: 'https://grasshopper.com', badge: 'Paid' },
      { name: 'ListYourself.net', desc: 'List your business in 411 directories for bureau credibility', url: 'https://www.listyourself.net', badge: 'Free' },
      { name: 'Yext', desc: 'Sync your business listings across 100+ directories at once', url: 'https://www.yext.com', badge: 'Paid' },
    ],
  },
  {
    title: 'Domain & Professional Email',
    icon: Mail,
    items: [
      { name: 'Namecheap', desc: 'Affordable domain registration (.com from ~$9/yr)', url: 'https://www.namecheap.com', badge: 'Paid' },
      { name: 'Google Domains (Squarespace)', desc: 'Domain + email hosting, reliable and easy to set up', url: 'https://domains.squarespace.com', badge: 'Paid' },
      { name: 'Google Workspace', desc: 'Professional email at your domain (you@yourbiz.com) + Drive', url: 'https://workspace.google.com', badge: 'Paid' },
      { name: 'Zoho Mail', desc: 'Free professional domain email for up to 5 users', url: 'https://www.zoho.com/mail', badge: 'Free tier' },
    ],
  },
  {
    title: 'Website Builders',
    icon: Globe,
    items: [
      { name: 'Squarespace', desc: 'Professional templates, easy to use, built-in domain + email', url: 'https://www.squarespace.com', badge: 'Paid' },
      { name: 'Wix', desc: 'Drag-and-drop website builder with free tier', url: 'https://www.wix.com', badge: 'Free tier' },
      { name: 'WordPress.com', desc: 'Most widely used platform — flexible and scalable', url: 'https://wordpress.com', badge: 'Free tier' },
      { name: 'Webflow', desc: 'Professional-grade sites with no coding required', url: 'https://webflow.com', badge: 'Paid' },
    ],
  },
  {
    title: 'Virtual Business Address',
    icon: MapPin,
    items: [
      { name: 'Regus', desc: 'Virtual office addresses in major cities — looks professional on bureau filings', url: 'https://www.regus.com/en-us/virtual-office', badge: 'Paid' },
      { name: 'Alliance Virtual Offices', desc: 'Affordable virtual address starting at $49/mo', url: 'https://www.alliancevirtualoffices.com', badge: 'Paid' },
      { name: 'iPostal1', desc: 'Real street address + mail scanning from $9.99/mo', url: 'https://www.ipostal1.com', badge: 'Paid' },
    ],
  },
  {
    title: 'Business Registration & EIN',
    icon: Building,
    items: [
      { name: 'IRS EIN Application', desc: 'Apply for your free Employer Identification Number instantly online', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', badge: 'Free' },
      { name: 'SOS — File with Your State (Official)', desc: 'File your LLC or Corporation directly with your state\'s Secretary of State. Use the NASS directory to find your state\'s official filing page.', url: 'https://www.nass.org/business-services/corps-llcs', badge: 'Varies' },
      { name: 'SOS — State Search via QuickSOS', desc: 'Third-party Secretary of State lookup tool — useful for searching existing business registrations. Not the official state filing site.', url: 'https://www.quicksos.com/secretary-of-state-search', badge: 'Third-party' },
      { name: 'LegalZoom', desc: 'Guided LLC/Corp formation with registered agent service', url: 'https://www.legalzoom.com', badge: 'Paid' },
      { name: 'Northwest Registered Agent', desc: 'Registered agent + business formation — privacy-focused', url: 'https://www.northwestregisteredagent.com', badge: 'Paid' },
    ],
  },
  {
    title: 'Business Listings & Credibility',
    icon: Star,
    items: [
      { name: 'Google Business Profile', desc: 'Free — creates a Google presence for your business, boosts legitimacy', url: 'https://business.google.com', badge: 'Free' },
      { name: 'Better Business Bureau', desc: 'BBB listing adds credibility for vendor and lender applications', url: 'https://www.bbb.org/bbb-directory', badge: 'Free/Paid' },
      { name: 'Yelp for Business', desc: 'Free business listing that reports to some credit bureaus', url: 'https://biz.yelp.com', badge: 'Free' },
      { name: 'LinkedIn Company Page', desc: 'Professional presence that lenders and vendors verify', url: 'https://www.linkedin.com/company/setup/new', badge: 'Free' },
    ],
  },
  {
    title: 'Business Credit Bureaus',
    icon: Briefcase,
    items: [
      { name: 'Dun & Bradstreet (D-U-N-S)', desc: 'Step 1 — Getting a D-U-N-S number is free and required by most vendors for net terms. Expedited processing may cost extra.', url: 'https://www.dnb.com/duns/get-a-duns.html', badge: 'Free setup' },
      { name: 'Nav Business Credit', desc: 'Step 2 — Best first monitoring step. Free tier tracks D&B, Experian, and Equifax business bureau standing in one dashboard. Start here before paying for other tools.', url: 'https://www.nav.com', badge: 'Free tier' },
      { name: 'Experian Business', desc: 'Step 3 — Set up access to your Experian Business credit file and Intelliscore Plus. Business monitoring and report access is a paid product.', url: 'https://www.experian.com/small-business/business-credit-report.jsp', badge: 'Paid' },
      { name: 'CreditSafe', desc: 'Step 4 — Business credit reports used by many net-30 vendors for approval decisions. Check if a free self-view for your own profile is available.', url: 'https://www.creditsafe.com/us/en.html', badge: 'Paid' },
      { name: 'Equifax Business', desc: 'Step 5 — Separate business credit profile from your personal Equifax. No verified direct self-serve signup route currently available. Monitor visibility via Nav or approved aggregator.', url: 'https://www.nav.com', badge: 'Via aggregator' },
    ],
  },
]

export default async function BusinessResourcesPage() {
  const { activeProfile: profile, activePrograms } = await requirePortalPageContext()

  return (
    <PortalLayout
      userName={profile?.full_name || ''}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      assignedProgram={profile?.assigned_program}
      portalBlocked={profile?.portal_blocked}
      isDemo={profile?.is_demo}
      isAdmin={profile?.is_admin}
      allPrograms={activePrograms}
    >
      <div className="space-y-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen size={24} className="text-green-500" />
            Business Setup Resources
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Curated tools and services for building a lender-ready business profile
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
          <strong>Note:</strong> These are third-party resources provided for informational purposes. SourcifyLending is not affiliated with these services and does not guarantee their availability, pricing, or suitability for your specific situation.
        </div>

        {RESOURCE_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <div key={section.title} className="card">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Icon size={18} className="text-green-500" />
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <a
                    key={item.name}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-green-200 hover:bg-green-50 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-green-700">{item.name}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          item.badge === 'Free' || item.badge === 'Free setup'
                            ? 'bg-green-100 text-green-700' :
                          item.badge === 'Free tier'
                            ? 'bg-blue-100 text-blue-700' :
                          item.badge === 'Free/Paid'
                            ? 'bg-teal-100 text-teal-700' :
                          item.badge === 'Via aggregator'
                            ? 'bg-purple-100 text-purple-700' :
                          item.badge === 'Third-party'
                            ? 'bg-amber-100 text-amber-700' :
                          item.badge === 'Paid'
                            ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{item.badge}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                    <Globe size={14} className="text-gray-300 group-hover:text-green-500 shrink-0 mt-1 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </PortalLayout>
  )
}
