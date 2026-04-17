import Anthropic from '@anthropic-ai/sdk'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { logPortalEvent } from '@/lib/portal-events'
import { isMissingRelationError } from '@/lib/supabase-schema'
import { getContentMotion } from '@/lib/content-engine-types'
import type {
  ContentAiVisibilityDashboard,
  ContentConversionDashboard,
  ContentDashboardSnapshot,
  ContentCtaBlock,
  ContentEventType,
  ContentFaqItem,
  ContentIdea,
  ContentInternalLink,
  ContentPartnerDashboard,
  ContentPerformancePageSummary,
  ContentMetricRecord,
  ContentMetricSource,
  ContentPageRecord,
  ContentPageSeed,
  ContentRevenueBreakdownRow,
  ContentRevenueDashboard,
  ContentRouteGroup,
  ContentSection,
  ContentSnapshot,
  ContentTemplateType,
  ContentUpdateRecord,
  ContentVisibilityDashboard,
  ContentWorkflowStatus,
} from '@/lib/content-engine-types'
export {
  CONTENT_EVENT_TYPES,
  CONTENT_IDEA_STATUSES,
  CONTENT_METRIC_SOURCES,
  CONTENT_ROUTE_GROUPS,
  CONTENT_TEMPLATE_TYPES,
  CONTENT_WORKFLOW_STATUSES,
  getContentRouteLabel,
} from '@/lib/content-engine-types'

type JsonRecord = Record<string, unknown>

export const PRIORITY_CONTENT_SEEDS: ContentPageSeed[] = [
  {
    routeGroup: 'services',
    contentType: 'service_page',
    slug: 'business-credit-builder',
    topic: 'Business Credit Builder',
    motion: 'client_acquisition',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'business credit builder',
    secondaryKeywords: ['build business credit under EIN', 'vendor tradelines for business credit'],
  },
  {
    routeGroup: 'services',
    contentType: 'service_page',
    slug: '0-intro-apr-advisory',
    topic: '0% Intro APR Advisory',
    motion: 'client_acquisition',
    buyerIntent: 'solution_aware',
    primaryKeyword: '0 intro apr business credit advisory',
    secondaryKeywords: ['0 apr business credit cards strategy', 'business credit card sequencing'],
  },
  {
    routeGroup: 'services',
    contentType: 'service_page',
    slug: 'funding-readiness-review',
    topic: 'Funding Readiness Review',
    motion: 'client_acquisition',
    buyerIntent: 'high_intent',
    primaryKeyword: 'funding readiness review',
    secondaryKeywords: ['business funding readiness', 'bank statement funding preparation'],
  },
  {
    routeGroup: 'industries',
    contentType: 'industry_page',
    slug: 'trucking-business-funding',
    topic: 'Best funding path for trucking businesses',
    motion: 'client_acquisition',
    buyerIntent: 'high_intent',
    primaryKeyword: 'trucking business funding',
    secondaryKeywords: ['semi truck funding readiness', 'business credit for trucking companies'],
    industryName: 'Trucking',
  },
  {
    routeGroup: 'industries',
    contentType: 'industry_page',
    slug: 'contractor-business-funding',
    topic: 'Best funding path for contractors',
    motion: 'client_acquisition',
    buyerIntent: 'high_intent',
    primaryKeyword: 'contractor business funding',
    secondaryKeywords: ['funding for contractors', 'construction business credit'],
    industryName: 'Contractors',
  },
  {
    routeGroup: 'industries',
    contentType: 'industry_page',
    slug: 'home-services-business-funding',
    topic: 'Best funding path for home services companies',
    motion: 'client_acquisition',
    buyerIntent: 'high_intent',
    primaryKeyword: 'home services business funding',
    secondaryKeywords: ['HVAC business funding', 'plumbing business credit'],
    industryName: 'Home Services',
  },
  {
    routeGroup: 'answers',
    contentType: 'answer_page',
    slug: 'how-to-qualify-for-business-funding',
    topic: 'How to qualify for business funding',
    motion: 'client_acquisition',
    buyerIntent: 'problem_aware',
    primaryKeyword: 'how to qualify for business funding',
    secondaryKeywords: ['business funding requirements', 'qualify for working capital'],
  },
  {
    routeGroup: 'comparisons',
    contentType: 'comparison_page',
    slug: 'business-credit-vs-personal-credit-for-funding',
    topic: 'Business credit vs personal credit for funding',
    motion: 'client_acquisition',
    buyerIntent: 'comparison',
    primaryKeyword: 'business credit vs personal credit for funding',
    secondaryKeywords: ['business credit vs personal credit', 'which credit matters for business funding'],
  },
  {
    routeGroup: 'portal-guides',
    contentType: 'portal_guide_page',
    slug: 'get-started-in-the-portal',
    topic: 'Portal walkthrough and getting started',
    motion: 'client_acquisition',
    buyerIntent: 'product_aware',
    primaryKeyword: 'how to get started in the portal',
    secondaryKeywords: ['sourcifylending portal walkthrough', 'business credit portal guide'],
  },
  {
    routeGroup: 'problems',
    contentType: 'problem_page',
    slug: 'why-was-i-denied-business-funding',
    topic: 'Why was I denied business funding?',
    motion: 'client_acquisition',
    buyerIntent: 'problem_aware',
    primaryKeyword: 'why was i denied business funding',
    secondaryKeywords: ['why business loan denied', 'why funding application declined'],
  },
  {
    routeGroup: 'partners',
    contentType: 'partner_program_page',
    slug: 'partner-program',
    topic: 'SourcifyLending Partner Program',
    motion: 'partner_recruitment',
    buyerIntent: 'high_intent',
    primaryKeyword: 'business funding partner program',
    secondaryKeywords: ['business credit partner program', 'sourcifylending partner program'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'sales-reps',
    topic: 'Partner program for sales reps',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'business funding partner program for sales reps',
    secondaryKeywords: ['closer partner program', 'sales rep recurring commissions'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'credit-consultants',
    topic: 'Partner program for credit consultants',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'business credit partner program for consultants',
    secondaryKeywords: ['credit consultant recurring revenue', 'white label business credit partner'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'tax-professionals',
    topic: 'Partner program for tax professionals',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'partner program for tax professionals',
    secondaryKeywords: ['accountant recurring revenue program', 'tax pro business funding referrals'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'insurance-agents',
    topic: 'Partner program for insurance agents',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'partner program for insurance agents',
    secondaryKeywords: ['insurance agent recurring commissions', 'business owner referral partner'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'real-estate-professionals',
    topic: 'Partner program for real estate professionals',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'partner program for real estate professionals',
    secondaryKeywords: ['commercial real estate referral partner', 'real estate professional recurring revenue'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'business-coaches',
    topic: 'Partner program for business coaches',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'partner program for business coaches',
    secondaryKeywords: ['business coach recurring revenue', 'business coaching partner program'],
  },
  {
    routeGroup: 'partner-personas',
    contentType: 'partner_persona_page',
    slug: 'agencies',
    topic: 'Partner program for agencies',
    motion: 'partner_recruitment',
    buyerIntent: 'solution_aware',
    primaryKeyword: 'partner program for agencies',
    secondaryKeywords: ['agency recurring revenue partner program', 'done for you business funding partner'],
  },
  {
    routeGroup: 'partner-earnings',
    contentType: 'partner_earnings_page',
    slug: 'partner-program-earnings',
    topic: 'How partner earnings work',
    motion: 'partner_recruitment',
    buyerIntent: 'comparison',
    primaryKeyword: 'business funding partner commissions',
    secondaryKeywords: ['setup fee commissions', 'recurring revenue partner program'],
  },
  {
    routeGroup: 'partner-earnings',
    contentType: 'partner_earnings_page',
    slug: 'recurring-revenue',
    topic: 'Recurring revenue for partners',
    motion: 'partner_recruitment',
    buyerIntent: 'comparison',
    primaryKeyword: 'recurring revenue partner program',
    secondaryKeywords: ['monthly recurring commissions', 'partner program residual income'],
  },
  {
    routeGroup: 'partner-guides',
    contentType: 'partner_guide_page',
    slug: 'how-it-works',
    topic: 'How the partner onboarding model works',
    motion: 'partner_recruitment',
    buyerIntent: 'product_aware',
    primaryKeyword: 'how the partner program works',
    secondaryKeywords: ['partner onboarding process', 'partner assisted client workflow'],
  },
  {
    routeGroup: 'partner-comparisons',
    contentType: 'partner_comparison_page',
    slug: 'partner-program-vs-affiliate-program',
    topic: 'Partner program vs affiliate program',
    motion: 'partner_recruitment',
    buyerIntent: 'comparison',
    primaryKeyword: 'partner program vs affiliate program',
    secondaryKeywords: ['affiliate vs partner model', 'closer program vs referral program'],
  },
  {
    routeGroup: 'partner-comparisons',
    contentType: 'partner_comparison_page',
    slug: 'recurring-commissions-vs-one-time-commissions',
    topic: 'Recurring commissions vs one-time commissions',
    motion: 'partner_recruitment',
    buyerIntent: 'comparison',
    primaryKeyword: 'recurring commissions vs one time commissions',
    secondaryKeywords: ['residual vs upfront commissions', 'partner recurring revenue model'],
  },
  {
    routeGroup: 'partner-comparisons',
    contentType: 'partner_comparison_page',
    slug: 'partner-model-vs-building-your-own-offer',
    topic: 'SourcifyLending partner model vs building your own offer',
    motion: 'partner_recruitment',
    buyerIntent: 'comparison',
    primaryKeyword: 'partner model vs building your own offer',
    secondaryKeywords: ['build your own fulfillment vs partner platform', 'white label vs partner model'],
  },
  {
    routeGroup: 'partner-faqs',
    contentType: 'partner_faq_page',
    slug: 'partner-program-faq',
    topic: 'Partner program FAQ and objections',
    motion: 'partner_recruitment',
    buyerIntent: 'problem_aware',
    primaryKeyword: 'partner program faq',
    secondaryKeywords: ['partner program objections', 'business funding partnership faq'],
  },
]

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sourcifylending.com').replace(/\/$/, '')

function slugToTitle(input: string) {
  return input
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function safeArray<T>(input: unknown): T[] {
  return Array.isArray(input) ? input as T[] : []
}

function trimText(input: string | null | undefined, fallback = '') {
  return input?.trim() || fallback
}

export function getCanonicalPath(routeGroup: ContentRouteGroup, slug: string) {
  return `/${routeGroup}/${slug}`
}

export function getPublicContentUrl(routeGroup: ContentRouteGroup, slug: string) {
  return `${SITE_ORIGIN}${getCanonicalPath(routeGroup, slug)}`
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items))
}

function isPartnerRouteGroup(routeGroup: ContentRouteGroup) {
  return routeGroup.startsWith('partner') as boolean
}

export function buildContentQualityReport(page: Pick<
  ContentPageRecord,
  'title_tag' | 'meta_description' | 'hero_summary' | 'body_sections' | 'faq_items' | 'cta_blocks' | 'trust_points' | 'schema_json' | 'internal_links'
>) {
  const issues: string[] = []
  let score = 100

  if (!trimText(page.title_tag)) {
    issues.push('Missing title tag')
    score -= 15
  }

  if (!trimText(page.meta_description)) {
    issues.push('Missing meta description')
    score -= 12
  }

  if (wordCount(trimText(page.hero_summary)) < 18) {
    issues.push('Short answer near top is too thin')
    score -= 10
  }

  const sections = safeArray<ContentSection>(page.body_sections)
  const totalWords = sections.reduce((count, section) => count + wordCount(section.body) + safeArray<string>(section.bullets).join(' ').split(/\s+/).filter(Boolean).length, 0)
  if (sections.length < 3 || totalWords < 350) {
    issues.push('Main content is thin')
    score -= 20
  }

  if (safeArray<ContentFaqItem>(page.faq_items).length < 2) {
    issues.push('FAQ coverage is weak')
    score -= 8
  }

  if (safeArray<ContentCtaBlock>(page.cta_blocks).length === 0) {
    issues.push('Missing CTA block')
    score -= 12
  }

  if (safeArray<string>(page.trust_points).length < 2) {
    issues.push('Trust signals are missing')
    score -= 10
  }

  if (!page.schema_json || Object.keys(page.schema_json).length === 0) {
    issues.push('Missing schema markup')
    score -= 12
  }

  if (safeArray<ContentInternalLink>(page.internal_links).length < 2) {
    issues.push('Needs stronger internal linking')
    score -= 8
  }

  return {
    qualityScore: Math.max(0, Math.min(100, score)),
    qualityIssues: issues,
  }
}

function getRouteGroupDescription(seed: ContentPageSeed) {
  switch (seed.routeGroup) {
    case 'services':
      return `This page explains how SourcifyLending delivers ${seed.topic} and when that service fits the buyer.`
    case 'industries':
      return `This page explains the funding path, underwriting friction, and business credit strategy for ${seed.industryName || seed.topic}.`
    case 'answers':
      return `This page gives a direct answer, then expands into the steps, mistakes, and decision points around ${seed.topic}.`
    case 'comparisons':
      return 'This page compares options side by side and explains the tradeoffs buyers should understand before they apply.'
    case 'locations':
      return `This page explains how SourcifyLending helps businesses in ${seed.locationName || seed.topic}.`
    case 'portal-guides':
      return 'This page walks a new prospect through the portal flow and shows what to do first.'
    case 'problems':
      return 'This page explains why the problem happens and what to fix next before reapplying.'
    case 'partners':
      return 'This page explains the SourcifyLending partner model, who it fits, how revenue works, and what the next step is to apply.'
    case 'partner-personas':
      return `This page explains how the SourcifyLending partner model fits ${seed.topic.toLowerCase()} and what that persona is responsible for in the relationship.`
    case 'partner-earnings':
      return 'This page explains how partner economics work, what is paid on setup vs recurring revenue, and where the model is stronger than one-time referral programs.'
    case 'partner-guides':
      return 'This page walks a prospective partner through onboarding, client ownership, and how the partner-assisted workflow actually runs.'
    case 'partner-comparisons':
      return 'This page compares the SourcifyLending partner model against the alternatives and makes the tradeoffs explicit.'
    case 'partner-faqs':
      return 'This page answers the objections and operational questions prospective partners usually ask before they apply.'
    case 'partner-case-studies':
      return 'This page shows real or representative partner examples, economics, and implementation patterns.'
  }
}

function buildFallbackSections(seed: ContentPageSeed): ContentSection[] {
  const topicTitle = seed.topic
  const industryLine = seed.industryName ? `${seed.industryName} owners` : 'business owners'

  if (isPartnerRouteGroup(seed.routeGroup)) {
    const partnerSections: ContentSection[] = [
      {
        heading: `What ${topicTitle} actually means`,
        body: `${topicTitle} is a partner-recruitment page, not a generic affiliate pitch. SourcifyLending's partner model is built for operators who want to bring in clients, close them, onboard them, and keep the relationship while using SourcifyLending as the platform and fulfillment layer behind the scenes.`,
        bullets: [
          'Built for partner-assisted client acquisition, not passive link drops',
          'Partners stay client-facing while SourcifyLending provides infrastructure',
          'The model is designed around recurring revenue, not just one-time payouts',
        ],
      },
      {
        heading: 'Why serious partners consider this model',
        body: 'The partner offer is stronger when it helps someone monetize an existing audience or service base without forcing them to build their own billing rails, onboarding stack, fulfillment workflow, or recurring delivery operation from scratch.',
        bullets: [
          'Shorter path to a monetizable offer',
          'Cleaner recurring revenue model for existing audiences',
          'Less operational drag than building a full offer alone',
        ],
      },
      {
        heading: 'How SourcifyLending structures the relationship',
        body: 'SourcifyLending positions the partner as the frontline operator for the client relationship. That means the page must be clear about expectations: bringing in the client, helping close the client, supporting onboarding, and staying involved after the sale where appropriate.',
        bullets: [
          'Apply to the partner program',
          'Book a partner call if you need qualification clarity',
          'Open or activate the partner account once approved',
        ],
      },
    ]

    if (seed.routeGroup === 'partner-comparisons') {
      partnerSections.push({
        heading: 'Comparison table',
        body: 'The page should show exactly where the economics and workload differ so qualified partners can self-select quickly.',
        table: {
          headers: ['Decision Factor', 'SourcifyLending Partner Model', 'Alternative'],
          rows: [
            ['Primary payout model', 'Recurring revenue plus defined setup economics', 'Usually one-time referral payout only'],
            ['Client ownership', 'Partner remains client-facing', 'Often handed off after referral'],
            ['Operational burden', 'Use existing platform and fulfillment rails', 'Build your own offer, onboarding, and delivery stack'],
          ],
        },
      })
    }

    if (seed.routeGroup === 'partner-guides') {
      partnerSections.unshift({
        heading: 'Quick answer',
        body: 'A strong partner onboarding page should explain who owns the client, how a partner-assisted deal is submitted, what happens after approval, and where compensation is earned.',
        bullets: [
          'Apply or book a partner call first',
          'Understand the partner-assisted workflow before bringing in clients',
          'Use the approved partner account to manage client acquisition and onboarding',
        ],
      })
    }

    return partnerSections
  }

  const common: ContentSection[] = [
    {
      heading: `What ${topicTitle} means`,
      body: `${topicTitle} is not a generic checklist. SourcifyLending uses it as a decision system that looks at business identity setup, bankability, credit profile, and application timing before sending a business into the wrong funding path.`,
      bullets: [
        'Clarify the right funding objective before applications start',
        'Reduce avoidable denials caused by timing, documentation, or profile gaps',
        'Move the business toward the most realistic approval path first',
      ],
    },
    {
      heading: 'What buyers usually get wrong',
      body: `${industryLine} often apply too early, mix personal and business credit strategy, or focus on the wrong funding product first. That creates denials, more inquiries, and weaker positioning for the next round.`,
      bullets: [
        'Applying before banking and entity details are ready',
        'Using the wrong sequence for business credit and funding products',
        'Ignoring what underwriters will see in deposits, utilization, or recent inquiries',
      ],
    },
    {
      heading: 'How SourcifyLending approaches it',
      body: 'SourcifyLending uses a structured portal workflow: readiness review, action plan, portal tasks, and follow-through support. The goal is to help a prospect take the next highest-leverage step instead of guessing.',
      bullets: [
        'Funding Readiness Review to diagnose the real blocker',
        'Portal guidance to collect documents and complete the right actions',
        'Ongoing tracking so the business can improve eligibility and timing',
      ],
    },
  ]

  if (seed.routeGroup === 'comparisons') {
    common.push({
      heading: 'Side-by-side comparison',
      body: 'A useful comparison page should make the tradeoffs explicit instead of pretending every business should use the same approach.',
      table: {
        headers: ['Decision Factor', 'Option 1', 'Option 2'],
        rows: [
          ['Primary use case', 'Initial approvals and immediate access', 'Longer-term funding strength and underwriter positioning'],
          ['Risk if handled badly', 'More inquiries and weaker terms', 'Slow progress with no funding plan'],
          ['Best next step', 'Review timing and application sequence', 'Build the profile needed for the next funding tier'],
        ],
      },
    })
  }

  if (seed.routeGroup === 'portal-guides') {
    common.unshift({
      heading: 'Quick answer',
      body: 'The first goal in the portal is not to click through everything. It is to complete the highest-priority steps that improve eligibility and move the business toward the right program.',
      bullets: [
        'Complete the analyzer or intake path',
        'Review your assigned guidance and immediate next steps',
        'Upload documents and finish the readiness tasks first',
      ],
    })
  }

  return common
}

function buildFallbackFaqs(seed: ContentPageSeed): ContentFaqItem[] {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    return [
      {
        question: `Who is ${seed.topic.toLowerCase()} for?`,
        answer: `${seed.topic} is for closers, consultants, agencies, and referral partners who want recurring revenue and a partner-assisted workflow instead of a one-time referral arrangement.`,
      },
      {
        question: 'Do I have to build my own offer or fulfillment stack?',
        answer: 'No. The partner model is designed so you can stay client-facing while SourcifyLending provides the platform, billing rails, and delivery infrastructure behind the scenes.',
      },
      {
        question: 'What is the next step if I want to move forward?',
        answer: 'Apply through the partner page, book a partner call if you need qualification clarity, and once approved activate the partner account so you can start bringing in partner-assisted clients.',
      },
    ]
  }

  return [
    {
      question: `Who is ${seed.topic} for?`,
      answer: `${seed.topic} is for businesses that want a clearer path to business credit, funding readiness, or portal onboarding instead of guessing which product to apply for next.`,
    },
    {
      question: 'Does this guarantee approval?',
      answer: 'No. SourcifyLending does not guarantee approvals, limits, or funding outcomes. The goal is to improve readiness and decision quality before applications are submitted.',
    },
    {
      question: 'What should I do next if I am interested?',
      answer: 'Use the portal or get-started flow so SourcifyLending can review the business profile, identify the blocker, and route you into the best next funding path.',
    },
  ]
}

function buildFallbackTrustPoints(seed: ContentPageSeed) {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    return dedupe([
      'Clear partner-assisted model instead of a vague affiliate pitch',
      'Economics tied to actual collected revenue, not empty earnings hype',
      `Built around ${seed.primaryKeyword} and partner objections people actually search`,
    ])
  }

  return dedupe([
    'Structured portal workflow instead of one-off advice',
    'Clear next-step guidance tied to readiness and buyer intent',
    `Focused on ${seed.primaryKeyword} and adjacent decision questions buyers actually ask`,
  ])
}

function buildInternalLinks(seed: ContentPageSeed): ContentInternalLink[] {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    const links: ContentInternalLink[] = [
      { label: 'Partner Program', href: '/partners/partner-program', reason: 'Primary partner landing page' },
      { label: 'How the Partner Model Works', href: '/partner-guides/how-it-works', reason: 'Onboarding path' },
      { label: 'Partner Program vs Affiliate Program', href: '/partner-comparisons/partner-program-vs-affiliate-program', reason: 'Comparison support' },
      { label: 'Recurring Revenue for Partners', href: '/partner-earnings/recurring-revenue', reason: 'Economics support' },
      { label: 'Apply to Become a Partner', href: '/partners', reason: 'Primary partner CTA' },
    ]

    if (seed.routeGroup !== 'partner-faqs') {
      links.push({
        label: 'Partner Program FAQ',
        href: '/partner-faqs/partner-program-faq',
        reason: 'Objection handling',
      })
    }

    return dedupe(links.map((item) => JSON.stringify(item))).map((value) => JSON.parse(value) as ContentInternalLink)
  }

  const links: ContentInternalLink[] = [
    { label: 'Get started in the portal', href: '/get-started', reason: 'Primary conversion path' },
    { label: 'Business Credit Builder', href: '/services/business-credit-builder', reason: 'Core service page' },
    { label: 'Funding Readiness Review', href: '/services/funding-readiness-review', reason: 'Readiness CTA' },
    { label: 'How to qualify for business funding', href: '/answers/how-to-qualify-for-business-funding', reason: 'Educational support' },
  ]

  if (seed.routeGroup !== 'problems') {
    links.push({
      label: 'Why was I denied business funding?',
      href: '/problems/why-was-i-denied-business-funding',
      reason: 'Common objection path',
    })
  }

  return dedupe(links.map((item) => JSON.stringify(item))).map((value) => JSON.parse(value) as ContentInternalLink)
}

function buildCtaBlocks(seed: ContentPageSeed): ContentCtaBlock[] {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    return [
      {
        title: 'Apply to the partner program',
        body: `Use the partner application flow if ${seed.topic.toLowerCase()} matches how you want to bring in, close, and onboard clients with SourcifyLending.`,
        primaryLabel: 'Apply Now',
        primaryHref: '/partners',
        secondaryLabel: 'Book Partner Call',
        secondaryHref: '/partners#apply-form',
      },
      {
        title: 'Already approved?',
        body: 'Open the partner account and start running partner-assisted clients through the approved workflow.',
        primaryLabel: 'Partner Login',
        primaryHref: '/affiliate/login',
        secondaryLabel: 'Create Partner Account',
        secondaryHref: '/partners',
      },
    ]
  }

  return [
    {
      title: 'See the best next funding path',
      body: `Start in the portal so SourcifyLending can review the business, identify the blocker, and recommend the next highest-leverage move for ${seed.topic}.`,
      primaryLabel: 'Get Started',
      primaryHref: '/get-started',
      secondaryLabel: 'Open the Analyzer',
      secondaryHref: '/analyzer',
    },
  ]
}

function buildComparisonRows(seed: ContentPageSeed) {
  if (seed.routeGroup === 'partner-comparisons') {
    return [
      {
        feature: 'Revenue model',
        sourcify: 'Recurring partner economics tied to collected revenue',
        alternative: 'Often one-time referral payout only',
      },
      {
        feature: 'Client ownership',
        sourcify: 'Partner remains in the relationship',
        alternative: 'Client is usually handed off immediately',
      },
      {
        feature: 'Build burden',
        sourcify: 'Use existing platform and operations',
        alternative: 'Build your own offer, billing, onboarding, and fulfillment',
      },
    ]
  }

  if (seed.routeGroup !== 'comparisons') return []

  return [
    {
      feature: 'Primary focus',
      sourcify: 'Business credit positioning and funding readiness',
      alternative: 'Personal credit leverage only',
    },
    {
      feature: 'Best for',
      sourcify: 'Businesses building longer-term funding access',
      alternative: 'Owners who only want a short-term application push',
    },
    {
      feature: 'Main risk',
      sourcify: 'Slower start if setup work is ignored',
      alternative: 'More denials and weaker underwriting posture',
    },
  ]
}

function buildTitleTag(seed: ContentPageSeed) {
  return `${slugToTitle(seed.slug)} | SourcifyLending`
}

function buildMetaDescription(seed: ContentPageSeed) {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    return `Learn how ${seed.topic.toLowerCase()} works with SourcifyLending. Compare the partner model, understand the economics, and apply for the partner program.`
  }
  return `Learn about ${seed.topic.toLowerCase()} with SourcifyLending. Get a clear answer, practical next steps, and a direct path into the portal.`
}

function buildHeroSummary(seed: ContentPageSeed) {
  if (isPartnerRouteGroup(seed.routeGroup)) {
    return `${seed.topic} works best when the page quickly explains who the partner model fits, how client ownership works, what recurring revenue looks like, and what the next step is to apply or open a partner account.`
  }
  return `${seed.topic} works best when a business knows what underwriters will see, what funding path fits the profile, and what steps should happen before the next application. SourcifyLending helps organize that process instead of leaving it to guesswork.`
}

function buildIntroText(seed: ContentPageSeed) {
  const destination = isPartnerRouteGroup(seed.routeGroup) ? 'the partner funnel' : 'the portal'
  return `${getRouteGroupDescription(seed)} This first version is intentionally structured for both traditional search and AI-driven answers: short answer near the top, clear supporting sections, FAQs, schema, trust signals, and a direct next step into ${destination}.`
}

export function buildSchemaJson(page: Pick<
  ContentPageRecord,
  'canonical_path' | 'meta_description' | 'h1' | 'faq_items' | 'author_name' | 'schema_type'
>) {
  const faqItems = safeArray<ContentFaqItem>(page.faq_items)
  const baseArticle = {
    '@context': 'https://schema.org',
    '@type': page.schema_type || 'Article',
    headline: page.h1,
    description: page.meta_description,
    url: `${SITE_ORIGIN}${page.canonical_path}`,
    dateModified: new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: page.author_name || 'SourcifyLending',
    },
    publisher: {
      '@type': 'Organization',
      name: 'SourcifyLending',
      url: SITE_ORIGIN,
    },
  }

  if (faqItems.length === 0) return baseArticle

  return {
    ...baseArticle,
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export function buildFallbackDraft(seed: ContentPageSeed): Omit<ContentPageRecord, 'id' | 'created_at' | 'updated_at' | 'published_at' | 'last_updated_at' | 'refresh_due_at'> {
  const base: Omit<ContentPageRecord, 'id' | 'created_at' | 'updated_at' | 'published_at' | 'last_updated_at' | 'refresh_due_at'> = {
    route_group: seed.routeGroup,
    content_type: seed.contentType,
    slug: seed.slug,
    canonical_path: getCanonicalPath(seed.routeGroup, seed.slug),
    title_tag: buildTitleTag(seed),
    meta_description: buildMetaDescription(seed),
    h1: slugToTitle(seed.slug),
    hero_summary: buildHeroSummary(seed),
    brief_summary: `Priority ${seed.contentType.replace(/_/g, ' ')} targeting ${seed.primaryKeyword} with a conversion path into ${isPartnerRouteGroup(seed.routeGroup) ? 'the partner funnel' : 'the portal'}.`,
    buyer_intent: seed.buyerIntent,
    target_keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
    workflow_status: 'draft',
    intro_text: buildIntroText(seed),
    body_sections: buildFallbackSections(seed),
    faq_items: buildFallbackFaqs(seed),
    cta_blocks: buildCtaBlocks(seed),
    trust_points: buildFallbackTrustPoints(seed),
    comparison_rows: buildComparisonRows(seed),
    internal_links: buildInternalLinks(seed),
    schema_type: seed.routeGroup === 'answers' || seed.routeGroup === 'problems' || seed.routeGroup === 'partner-faqs' ? 'FAQPage' : 'Article',
    schema_json: {},
    author_name: 'SourcifyLending Editorial Team',
    reviewer_notes: null,
    freshness_label: 'Fresh draft',
    quality_score: 0,
    quality_issues: [],
    allow_auto_refresh: false,
    source_signals: [],
  }

  base.schema_json = buildSchemaJson(base)
  const quality = buildContentQualityReport(base)
  base.quality_score = quality.qualityScore
  base.quality_issues = quality.qualityIssues

  return base
}

function sanitizeAiJson(input: string) {
  const match = input.match(/\{[\s\S]*\}$/)
  return match ? match[0] : input
}

async function maybeEnhanceDraftWithAI(seed: ContentPageSeed, fallback: ReturnType<typeof buildFallbackDraft>) {
  if (!anthropic) return fallback

  try {
    const prompt = [
      'You are generating structured SEO content for SourcifyLending.',
      'Return only valid JSON with keys:',
      'title_tag, meta_description, h1, hero_summary, intro_text, body_sections, faq_items, trust_points.',
      'Requirements:',
      '- buyer-intent aligned',
      '- concise answer near top',
      '- practical, not fluffy',
      '- no guarantees of approvals or funding outcomes',
      '- keep CTA and internal linking implicit, not in body sections',
      `Content motion: ${seed.motion}`,
      `Topic: ${seed.topic}`,
      `Primary keyword: ${seed.primaryKeyword}`,
      `Secondary keywords: ${seed.secondaryKeywords.join(', ')}`,
      `Route group: ${seed.routeGroup}`,
    ].join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1800,
      system: 'Return JSON only. Do not wrap in markdown.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')

    if (!text.trim()) return fallback

    const parsed = JSON.parse(sanitizeAiJson(text)) as Partial<ContentPageRecord>
    const merged = {
      ...fallback,
      title_tag: trimText(parsed.title_tag, fallback.title_tag),
      meta_description: trimText(parsed.meta_description, fallback.meta_description),
      h1: trimText(parsed.h1, fallback.h1),
      hero_summary: trimText(parsed.hero_summary, fallback.hero_summary),
      intro_text: trimText(parsed.intro_text, fallback.intro_text || ''),
      body_sections: safeArray<ContentSection>(parsed.body_sections).length > 0 ? safeArray<ContentSection>(parsed.body_sections) : fallback.body_sections,
      faq_items: safeArray<ContentFaqItem>(parsed.faq_items).length > 0 ? safeArray<ContentFaqItem>(parsed.faq_items) : fallback.faq_items,
      trust_points: safeArray<string>(parsed.trust_points).length > 0 ? safeArray<string>(parsed.trust_points) : fallback.trust_points,
    }

    merged.schema_json = buildSchemaJson(merged)
    const quality = buildContentQualityReport(merged)
    merged.quality_score = quality.qualityScore
    merged.quality_issues = quality.qualityIssues
    merged.freshness_label = 'AI generated draft'
    return merged
  } catch (error) {
    console.error('[content-engine] AI draft enhancement failed', error)
    return fallback
  }
}

function containsAny(text: string, patterns: string[]) {
  const lower = text.toLowerCase()
  return patterns.some((pattern) => lower.includes(pattern))
}

function cleanEvidence(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function mapSignalToSeed(text: string): ContentPageSeed | null {
  const lower = text.toLowerCase()

  if (containsAny(lower, ['business credit builder', 'vendor', 'tradeline', 'ein credit', 'net 30'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'business-credit-builder') ?? null
  }
  if (containsAny(lower, ['0%', 'apr', 'credit card strategy', 'intro apr'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === '0-intro-apr-advisory') ?? null
  }
  if (containsAny(lower, ['readiness review', 'funding readiness', 'bank statements', 'underwriter'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'funding-readiness-review') ?? null
  }
  if (containsAny(lower, ['trucking', 'semi truck', 'owner operator'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'trucking-business-funding') ?? null
  }
  if (containsAny(lower, ['contractor', 'construction', 'roofing', 'remodel'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'contractor-business-funding') ?? null
  }
  if (containsAny(lower, ['hvac', 'plumbing', 'electrician', 'home services'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'home-services-business-funding') ?? null
  }
  if (containsAny(lower, ['why was i denied', 'denied', 'declined', 'rejected'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'why-was-i-denied-business-funding') ?? null
  }
  if (containsAny(lower, ['qualify', 'qualification', 'eligible for funding'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'how-to-qualify-for-business-funding') ?? null
  }
  if (containsAny(lower, ['business credit vs personal credit', 'personal credit', 'business vs personal'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'business-credit-vs-personal-credit-for-funding') ?? null
  }
  if (containsAny(lower, ['portal', 'get started', 'onboarding', 'where do i start'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'get-started-in-the-portal') ?? null
  }
  if (containsAny(lower, ['partner program', 'partner-assisted', 'close and onboard', 'partner assisted'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'partner-program') ?? null
  }
  if (containsAny(lower, ['sales rep', 'setter', 'closer'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'sales-reps') ?? null
  }
  if (containsAny(lower, ['credit consultant', 'credit specialist', 'credit repair'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'credit-consultants') ?? null
  }
  if (containsAny(lower, ['tax professional', 'accountant', 'cpa', 'bookkeeper'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'tax-professionals') ?? null
  }
  if (containsAny(lower, ['insurance agent', 'insurance broker'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'insurance-agents') ?? null
  }
  if (containsAny(lower, ['real estate', 'realtor', 'broker'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'real-estate-professionals') ?? null
  }
  if (containsAny(lower, ['business coach', 'coaching clients'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'business-coaches') ?? null
  }
  if (containsAny(lower, ['agency', 'agencies', 'marketing agency'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'agencies') ?? null
  }
  if (containsAny(lower, ['commission', 'compensation', 'payout', 'earnings'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'partner-program-earnings') ?? null
  }
  if (containsAny(lower, ['recurring revenue', 'residual income', 'monthly recurring'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'recurring-revenue') ?? null
  }
  if (containsAny(lower, ['affiliate program', 'referral program'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'partner-program-vs-affiliate-program') ?? null
  }
  if (containsAny(lower, ['one-time commissions', 'one time commissions', 'recurring commissions'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'recurring-commissions-vs-one-time-commissions') ?? null
  }
  if (containsAny(lower, ['build your own offer', 'white label', 'fulfillment stack'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'partner-model-vs-building-your-own-offer') ?? null
  }
  if (containsAny(lower, ['how it works', 'partner onboarding', 'onboarding process'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'how-it-works') ?? null
  }
  if (containsAny(lower, ['partner faq', 'objection', 'do i have to', 'what if'])) {
    return PRIORITY_CONTENT_SEEDS.find((seed) => seed.slug === 'partner-program-faq') ?? null
  }

  return null
}

async function fetchTopicSignals() {
  const supabase = await createServiceClient()

  const [
    crmLeadsRes,
    crmActivitiesRes,
    supportRes,
    analyzerRes,
    smsRes,
    partnerApplicationsRes,
  ] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, notes, latest_call_note, business_name, source, stage')
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('crm_activities')
      .select('id, type, body, created_at')
      .in('type', ['call', 'sms', 'note'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('support_messages')
      .select('id, subject, message, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('leads')
      .select('id, business_name, readiness_status, risk_flags, analyzer_answers, created_at')
      .order('created_at', { ascending: false })
      .limit(150),
    supabase
      .from('crm_lead_sms')
      .select('id, direction, message_body, created_at')
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('affiliate_applications')
      .select('id, name, company_name, promotion_plan, marketing_channels, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return {
    crmLeads: crmLeadsRes.data ?? [],
    crmActivities: crmActivitiesRes.data ?? [],
    supportMessages: supportRes.data ?? [],
    analyzerLeads: analyzerRes.data ?? [],
    inboundSms: smsRes.data ?? [],
    partnerApplications: partnerApplicationsRes.data ?? [],
  }
}

export async function syncTopicIdeasFromSignals() {
  const supabase = await createServiceClient()
  const signals = await fetchTopicSignals()
  const ideas: Omit<ContentIdea, 'id' | 'created_at' | 'updated_at'>[] = []

  for (const lead of signals.crmLeads) {
    for (const excerpt of [lead.notes, lead.latest_call_note].filter(Boolean)) {
      const text = cleanEvidence(String(excerpt))
      const seed = mapSignalToSeed(text)
      if (!seed) continue
      ideas.push({
        topic: seed.topic,
        cluster_key: seed.slug,
        buyer_intent: seed.buyerIntent,
        suggested_content_type: seed.contentType,
        source_type: 'crm_lead',
        source_record_id: lead.id,
        evidence_excerpt: text,
        keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
        priority_score: 70,
        status: 'new',
        metadata: {
          route_group: seed.routeGroup,
          stage: lead.stage,
          business_name: lead.business_name,
        },
      })
    }
  }

  for (const activity of signals.crmActivities) {
    const text = cleanEvidence(String(activity.body || ''))
    const seed = mapSignalToSeed(text)
    if (!seed) continue
    ideas.push({
      topic: seed.topic,
      cluster_key: seed.slug,
      buyer_intent: seed.buyerIntent,
      suggested_content_type: seed.contentType,
      source_type: `crm_${activity.type}`,
      source_record_id: activity.id,
      evidence_excerpt: text,
      keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
      priority_score: 68,
      status: 'new',
      metadata: {
        route_group: seed.routeGroup,
      },
    })
  }

  for (const message of signals.supportMessages) {
    const text = cleanEvidence(`${message.subject || ''} ${message.message || ''}`)
    const seed = mapSignalToSeed(text)
    if (!seed) continue
    ideas.push({
      topic: seed.topic,
      cluster_key: seed.slug,
      buyer_intent: seed.buyerIntent,
      suggested_content_type: seed.contentType,
      source_type: 'support_question',
      source_record_id: message.id,
      evidence_excerpt: text,
      keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
      priority_score: 75,
      status: 'new',
      metadata: {
        route_group: seed.routeGroup,
      },
    })
  }

  for (const analyzerLead of signals.analyzerLeads) {
    const text = cleanEvidence(JSON.stringify(analyzerLead.analyzer_answers || {}) + ' ' + (analyzerLead.risk_flags || []).join(' '))
    const seed = mapSignalToSeed(text)
    if (!seed) continue
    ideas.push({
      topic: seed.topic,
      cluster_key: seed.slug,
      buyer_intent: seed.buyerIntent,
      suggested_content_type: seed.contentType,
      source_type: 'analyzer_response',
      source_record_id: analyzerLead.id,
      evidence_excerpt: text,
      keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
      priority_score: 78,
      status: 'new',
      metadata: {
        route_group: seed.routeGroup,
        readiness_status: analyzerLead.readiness_status,
      },
    })
  }

  for (const sms of signals.inboundSms) {
    const text = cleanEvidence(String(sms.message_body || ''))
    const seed = mapSignalToSeed(text)
    if (!seed) continue
    ideas.push({
      topic: seed.topic,
      cluster_key: seed.slug,
      buyer_intent: seed.buyerIntent,
      suggested_content_type: seed.contentType,
      source_type: 'sms_reply',
      source_record_id: sms.id,
      evidence_excerpt: text,
      keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
      priority_score: 72,
      status: 'new',
      metadata: {
        route_group: seed.routeGroup,
      },
    })
  }

  for (const application of signals.partnerApplications) {
    const text = cleanEvidence([
      application.name,
      application.company_name,
      application.promotion_plan,
      Array.isArray(application.marketing_channels) ? application.marketing_channels.join(' ') : '',
    ].filter(Boolean).join(' '))
    const seed = mapSignalToSeed(text)
    if (!seed) continue
    ideas.push({
      topic: seed.topic,
      cluster_key: seed.slug,
      buyer_intent: seed.buyerIntent,
      suggested_content_type: seed.contentType,
      source_type: 'partner_application',
      source_record_id: application.id,
      evidence_excerpt: text,
      keywords: [seed.primaryKeyword, ...seed.secondaryKeywords],
      priority_score: 82,
      status: 'new',
      metadata: {
        route_group: seed.routeGroup,
        application_status: application.status,
        company_name: application.company_name,
      },
    })
  }

  if (ideas.length === 0) {
    return { inserted: 0, ideas: [] as ContentIdea[] }
  }

  const deduped = Object.values(
    ideas.reduce<Record<string, Omit<ContentIdea, 'id' | 'created_at' | 'updated_at'>>>((acc, item) => {
      const key = `${item.cluster_key}:${item.source_record_id}:${item.source_type}`
      acc[key] = item
      return acc
    }, {})
  )

  const { data, error } = await supabase
    .from('seo_content_topic_ideas')
    .upsert(
      deduped.map((item) => ({
        ...item,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'cluster_key,source_type,source_record_id', ignoreDuplicates: false }
    )
    .select('*')

  if (error) throw error

  return { inserted: data?.length ?? 0, ideas: (data ?? []) as ContentIdea[] }
}

export async function generatePriorityDrafts(createdBy: string | null) {
  const supabase = await createServiceClient()
  const { data: existingRows } = await supabase
    .from('seo_content_pages')
    .select('slug')
    .in('slug', PRIORITY_CONTENT_SEEDS.map((seed) => seed.slug))

  const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug))
  const inserts: JsonRecord[] = []

  for (const seed of PRIORITY_CONTENT_SEEDS) {
    if (existingSlugs.has(seed.slug)) continue
    const fallback = buildFallbackDraft(seed)
    const draft = await maybeEnhanceDraftWithAI(seed, fallback)
    inserts.push({
      ...draft,
      created_by: createdBy,
      updated_by: createdBy,
      last_updated_at: new Date().toISOString(),
      refresh_due_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (inserts.length === 0) {
    return { inserted: 0, pages: [] as ContentPageRecord[] }
  }

  const { data, error } = await supabase
    .from('seo_content_pages')
    .insert(inserts)
    .select('*')

  if (error) throw error

  await Promise.all((data ?? []).map((page) =>
    recordContentUpdate({
      pageId: page.id,
      updateType: 'generated',
      summary: `Priority content draft generated for ${page.h1}.`,
      metadata: {
        route_group: page.route_group,
        slug: page.slug,
      },
      createdBy,
    })
  ))

  return { inserted: data?.length ?? 0, pages: (data ?? []) as ContentPageRecord[] }
}

export async function fetchContentSnapshot(): Promise<ContentSnapshot> {
  const supabase = await createServiceClient()

  const [pagesRes, ideasRes, metricsRes, updatesRes, eventsRes, paymentsRes, affiliateApplicationsRes, affiliatesRes, affiliateReferralsRes, affiliateCommissionsRes] = await Promise.all([
    supabase.from('seo_content_pages').select('*').order('updated_at', { ascending: false }).limit(100),
    supabase.from('seo_content_topic_ideas').select('*').order('priority_score', { ascending: false }).limit(100),
    supabase.from('seo_content_metrics').select('*').order('metric_date', { ascending: false }).limit(300),
    supabase.from('seo_content_updates').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('seo_content_events').select('page_id, event_type, related_record_id, metadata, occurred_at').order('occurred_at', { ascending: false }).limit(2000),
    supabase.from('payment_records').select('user_id, amount, payment_status').limit(5000),
    supabase.from('affiliate_applications').select('id, email, status').limit(1000),
    supabase.from('affiliates').select('id, email, status').limit(1000),
    supabase.from('affiliate_referrals').select('affiliate_id, user_id, referral_status, subscription_active').limit(5000),
    supabase.from('affiliate_commissions').select('affiliate_id, gross_amount, status').limit(5000),
  ])

  const schemaMissing =
    isMissingRelationError(pagesRes.error, 'seo_content_pages') ||
    isMissingRelationError(ideasRes.error, 'seo_content_topic_ideas') ||
    isMissingRelationError(metricsRes.error, 'seo_content_metrics') ||
    isMissingRelationError(updatesRes.error, 'seo_content_updates') ||
    isMissingRelationError(eventsRes.error, 'seo_content_events')

  if (schemaMissing) {
    return {
      pages: [],
      topicIdeas: [],
      metrics: [],
      updates: [],
      dashboards: buildEmptyDashboards(),
      schemaMissing: true,
    }
  }

  if (pagesRes.error) throw pagesRes.error
  if (ideasRes.error) throw ideasRes.error
  if (metricsRes.error) throw metricsRes.error
  if (updatesRes.error) throw updatesRes.error
  if (eventsRes.error) throw eventsRes.error
  if (paymentsRes.error && !isMissingRelationError(paymentsRes.error, 'payment_records')) throw paymentsRes.error
  if (affiliateApplicationsRes.error && !isMissingRelationError(affiliateApplicationsRes.error, 'affiliate_applications')) throw affiliateApplicationsRes.error
  if (affiliatesRes.error && !isMissingRelationError(affiliatesRes.error, 'affiliates')) throw affiliatesRes.error
  if (affiliateReferralsRes.error && !isMissingRelationError(affiliateReferralsRes.error, 'affiliate_referrals')) throw affiliateReferralsRes.error
  if (affiliateCommissionsRes.error && !isMissingRelationError(affiliateCommissionsRes.error, 'affiliate_commissions')) throw affiliateCommissionsRes.error

  const pages = (pagesRes.data ?? []) as ContentPageRecord[]
  const topicIdeas = (ideasRes.data ?? []) as ContentIdea[]
  const metrics = (metricsRes.data ?? []) as ContentMetricRecord[]
  const updates = (updatesRes.data ?? []) as ContentUpdateRecord[]
  const events = (eventsRes.data ?? []) as ContentEventRow[]
  const payments = ((paymentsRes.data ?? []) as PaymentRecordRow[])
  const affiliateApplications = (affiliateApplicationsRes.data ?? []) as AffiliateApplicationRow[]
  const affiliates = (affiliatesRes.data ?? []) as AffiliateRow[]
  const affiliateReferrals = (affiliateReferralsRes.data ?? []) as AffiliateReferralRow[]
  const affiliateCommissions = (affiliateCommissionsRes.data ?? []) as AffiliateCommissionRow[]
  const dashboards = buildContentDashboards({
    pages,
    metrics,
    events,
    payments,
    affiliateApplications,
    affiliates,
    affiliateReferrals,
    affiliateCommissions,
  })

  return {
    pages,
    topicIdeas,
    metrics,
    updates,
    dashboards,
    schemaMissing: false,
  }
}

export async function getPublishedContentPage(routeGroup: ContentRouteGroup, slug: string) {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('seo_content_pages')
    .select('*')
    .eq('route_group', routeGroup)
    .eq('slug', slug)
    .eq('workflow_status', 'published')
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, 'seo_content_pages')) return null
    throw error
  }

  return data as ContentPageRecord | null
}

export async function getAllPublishedContentPaths() {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('seo_content_pages')
    .select('route_group, slug, updated_at, published_at')
    .eq('workflow_status', 'published')
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingRelationError(error, 'seo_content_pages')) return []
    throw error
  }

  return (data ?? []) as { route_group: ContentRouteGroup; slug: string; updated_at: string; published_at: string | null }[]
}

export function buildPageMetadata(page: ContentPageRecord): Metadata {
  return {
    title: page.title_tag,
    description: page.meta_description,
    alternates: {
      canonical: page.canonical_path,
    },
    openGraph: {
      title: page.title_tag,
      description: page.meta_description,
      url: `${SITE_ORIGIN}${page.canonical_path}`,
      siteName: 'SourcifyLending',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title_tag,
      description: page.meta_description,
    },
  }
}

export async function recordContentUpdate(args: {
  pageId: string
  updateType: string
  summary: string
  metadata?: JsonRecord
  createdBy?: string | null
}) {
  const supabase = await createServiceClient()
  await supabase.from('seo_content_updates').insert({
    page_id: args.pageId,
    update_type: args.updateType,
    summary: args.summary,
    metadata: args.metadata ?? {},
    created_by: args.createdBy ?? null,
    created_at: new Date().toISOString(),
  })
}

export async function submitIndexNow(paths: string[], initiatedBy?: string | null) {
  const key = process.env.INDEXNOW_KEY
  const host = process.env.INDEXNOW_HOST || 'www.sourcifylending.com'

  if (!key || paths.length === 0) {
    return { submitted: false, reason: 'missing_config_or_paths' as const }
  }

  const urls = dedupe(paths.map((path) => `${SITE_ORIGIN}${path}`))

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key,
        urlList: urls,
      }),
    })

    const ok = response.ok
    const supabase = await createServiceClient()
    const { data: pages } = await supabase
      .from('seo_content_pages')
      .select('id, canonical_path')
      .in('canonical_path', paths)

    await Promise.all((pages ?? []).map((page) =>
      supabase.from('seo_content_events').insert({
        page_id: page.id,
        event_type: 'indexnow_submission',
        related_record_id: null,
        metadata: {
          submitted_urls: urls,
          ok,
          status: response.status,
        },
        occurred_at: new Date().toISOString(),
      })
    ))

    if (!ok) {
      return {
        submitted: false,
        reason: `http_${response.status}`,
      }
    }

    return { submitted: true, reason: null }
  } catch (error) {
    console.error('[content-engine] IndexNow submission failed', error)
    return { submitted: false, reason: 'request_failed' }
  } finally {
    if (initiatedBy) {
      await logPortalEvent({
        userId: initiatedBy,
        eventType: 'content_indexnow_submission',
        category: 'reports',
        severity: 'info',
        title: 'Content IndexNow submission attempted',
        message: `Submitted ${paths.length} content URLs to IndexNow.`,
        metadata: {
          path_count: paths.length,
        },
      })
    }
  }
}

export async function updateContentWorkflow(args: {
  pageId: string
  workflowStatus: ContentWorkflowStatus
  createdBy?: string | null
}) {
  const supabase = await createServiceClient()
  const now = new Date().toISOString()
  const patch: JsonRecord = {
    workflow_status: args.workflowStatus,
    updated_at: now,
    updated_by: args.createdBy ?? null,
    last_updated_at: now,
  }

  if (args.workflowStatus === 'published') {
    patch.published_at = now
    patch.refresh_due_at = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
  }

  if (args.workflowStatus === 'needs_refresh') {
    patch.refresh_due_at = now
  }

  const { data, error } = await supabase
    .from('seo_content_pages')
    .update(patch)
    .eq('id', args.pageId)
    .select('*')
    .single()

  if (error) throw error

  await recordContentUpdate({
    pageId: args.pageId,
    updateType: 'status_changed',
    summary: `Workflow status changed to ${args.workflowStatus}.`,
    metadata: {
      workflow_status: args.workflowStatus,
    },
    createdBy: args.createdBy,
  })

  if (args.workflowStatus === 'published') {
    await submitIndexNow([data.canonical_path], args.createdBy)
  }

  return data as ContentPageRecord
}

export async function importContentMetrics(args: {
  rows: Array<{
    pageSlug: string
    routeGroup: ContentRouteGroup
    metricDate: string
    source: ContentMetricSource
    impressions?: number
    clicks?: number
    averagePosition?: number
    aiCitations?: number
    indexedStatus?: string
    leads?: number
    signups?: number
    bookedCalls?: number
    paidClients?: number
    metadata?: JsonRecord
  }>
  createdBy?: string | null
}) {
  const supabase = await createServiceClient()
  const { data: pages, error: pagesError } = await supabase.from('seo_content_pages').select('id, slug, route_group')

  if (pagesError) throw pagesError

  const pageMap = new Map((pages ?? []).map((page) => [`${page.route_group}:${page.slug}`, page.id]))
  const inserts = args.rows
    .map((row) => {
      const pageId = pageMap.get(`${row.routeGroup}:${row.pageSlug}`)
      if (!pageId) return null
      return {
        page_id: pageId,
        metric_date: row.metricDate,
        source: row.source,
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        average_position: row.averagePosition ?? null,
        ai_citations: row.aiCitations ?? 0,
        indexed_status: row.indexedStatus ?? null,
        leads: row.leads ?? 0,
        signups: row.signups ?? 0,
        booked_calls: row.bookedCalls ?? 0,
        paid_clients: row.paidClients ?? 0,
        metadata: row.metadata ?? {},
      }
    })
    .filter(Boolean)

  if (inserts.length === 0) return { imported: 0 }

  const { error } = await supabase.from('seo_content_metrics').upsert(inserts, {
    onConflict: 'page_id,metric_date,source',
    ignoreDuplicates: false,
  })

  if (error) throw error

  await Promise.all(inserts.map((row) =>
    recordContentUpdate({
      pageId: row!.page_id,
      updateType: 'metric_imported',
      summary: `Imported ${row!.source} metrics for ${row!.metric_date}.`,
      metadata: {
        source: row!.source,
        metric_date: row!.metric_date,
      },
      createdBy: args.createdBy,
    })
  ))

  return { imported: inserts.length }
}

type ContentEventRow = {
  page_id: string
  event_type: ContentEventType
  related_record_id: string | null
  metadata: JsonRecord | null
  occurred_at: string
}

type PaymentRecordRow = {
  user_id: string | null
  amount: number | string | null
  payment_status?: string | null
}

type AffiliateApplicationRow = {
  id: string
  email: string | null
  status: string | null
}

type AffiliateRow = {
  id: string
  email: string | null
  status: string | null
}

type AffiliateReferralRow = {
  affiliate_id: string | null
  user_id: string | null
  referral_status: string | null
  subscription_active: boolean | null
}

type AffiliateCommissionRow = {
  affiliate_id: string | null
  gross_amount: number | string | null
  status: string | null
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function divide(numerator: number, denominator: number) {
  if (!denominator) return 0
  return numerator / denominator
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function parseJsonRecord(input: JsonRecord | null | undefined) {
  return input ?? {}
}

function normalizeUrlPath(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) return null
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return new URL(input).pathname
    }
    return input.startsWith('/') ? input : `/${input}`
  } catch {
    return null
  }
}

function extractHost(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) return null
  try {
    return new URL(input).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isIndexedStatus(indexedStatus: string | null | undefined) {
  const value = indexedStatus?.toLowerCase() ?? ''
  return value.includes('indexed') && !value.includes('not indexed') && !value.includes('excluded')
}

function buildEmptyDashboards(): ContentDashboardSnapshot {
  return {
    visibility: {
      impressions: 0,
      clicks: 0,
      ctr: 0,
      averagePosition: null,
      indexedPages: 0,
      notIndexedPages: 0,
      topPages: [],
    },
    aiVisibility: {
      aiCitations: 0,
      aiDrivenClicks: 0,
      citationTrend: [],
      topCitedPages: [],
    },
    conversions: {
      portalClicks: 0,
      getStartedSubmissions: 0,
      signups: 0,
      bookedCalls: 0,
      paidClients: 0,
      topConversionPages: [],
    },
    revenue: {
      attributedRevenue: 0,
      paidClients: 0,
      revenueByPage: [],
      revenueByTopicCluster: [],
      revenueByIndustryPage: [],
    },
    partnerRecruitment: {
      partnerApplications: 0,
      approvedPartners: 0,
      activePartners: 0,
      partnerGeneratedSignups: 0,
      partnerGeneratedPaidClients: 0,
      partnerGeneratedRevenue: 0,
      topPartnerPages: [],
    },
  }
}

function buildContentDashboards(args: {
  pages: ContentPageRecord[]
  metrics: ContentMetricRecord[]
  events: ContentEventRow[]
  payments: PaymentRecordRow[]
  affiliateApplications: AffiliateApplicationRow[]
  affiliates: AffiliateRow[]
  affiliateReferrals: AffiliateReferralRow[]
  affiliateCommissions: AffiliateCommissionRow[]
}): ContentDashboardSnapshot {
  if (args.pages.length === 0) {
    return buildEmptyDashboards()
  }

  const pageSummaryMap = new Map<string, ContentPerformancePageSummary>()

  for (const page of args.pages) {
    pageSummaryMap.set(page.id, {
      pageId: page.id,
      title: page.h1,
      canonicalPath: page.canonical_path,
      routeGroup: page.route_group,
      motion: getContentMotion(page.route_group),
      workflowStatus: page.workflow_status,
      topicCluster: page.slug,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      averagePosition: null,
      indexedStatus: 'unknown',
      aiCitations: 0,
      aiDrivenClicks: 0,
      portalClicks: 0,
      getStartedSubmissions: 0,
      signups: 0,
      bookedCalls: 0,
      paidClients: 0,
      revenue: 0,
      partnerApplications: 0,
      approvedPartners: 0,
      activePartners: 0,
      partnerGeneratedSignups: 0,
      partnerGeneratedPaidClients: 0,
      partnerGeneratedRevenue: 0,
    })
  }

  const latestMetricByPage = new Map<string, ContentMetricRecord>()
  const citationTrendMap = new Map<string, { citations: number; aiDrivenClicks: number }>()

  for (const metric of args.metrics) {
    const summary = pageSummaryMap.get(metric.page_id)
    if (!summary) continue

    summary.impressions += metric.impressions ?? 0
    summary.clicks += metric.clicks ?? 0
    summary.aiCitations += metric.ai_citations ?? 0

    const metadata = parseJsonRecord(metric.metadata)
    summary.aiDrivenClicks += toNumber(metadata.ai_driven_clicks)

    const currentMetric = latestMetricByPage.get(metric.page_id)
    if (!currentMetric || metric.metric_date > currentMetric.metric_date) {
      latestMetricByPage.set(metric.page_id, metric)
    }

    const currentTrend = citationTrendMap.get(metric.metric_date) ?? { citations: 0, aiDrivenClicks: 0 }
    currentTrend.citations += metric.ai_citations ?? 0
    currentTrend.aiDrivenClicks += toNumber(metadata.ai_driven_clicks)
    citationTrendMap.set(metric.metric_date, currentTrend)
  }

  const signupPageIdsByUserId = new Map<string, string[]>()
  const partnerApplicationPageIdsByApplicationId = new Map<string, string[]>()

  for (const event of args.events) {
    const summary = pageSummaryMap.get(event.page_id)
    if (!summary) continue
    const metadata = parseJsonRecord(event.metadata)
    const kind = typeof metadata.kind === 'string' ? metadata.kind : 'page_visit'
    const destinationPath = normalizeUrlPath(metadata.destination_path)

    if (event.event_type === 'visit') {
      if (kind === 'portal_click') {
        summary.portalClicks += 1
      }
      if (kind === 'page_visit' && metadata.channel === 'ai_search') {
        summary.aiDrivenClicks += 1
      }
      if (kind === 'portal_click' && destinationPath === '/get-started') {
        summary.getStartedSubmissions += 0
      }
    }

    if (event.event_type === 'lead') {
      summary.getStartedSubmissions += 1
    }

    if (event.event_type === 'signup') {
      summary.signups += 1
      if (event.related_record_id) {
        signupPageIdsByUserId.set(
          event.related_record_id,
          dedupe([...(signupPageIdsByUserId.get(event.related_record_id) ?? []), event.page_id])
        )
      }
    }

    if (event.event_type === 'partner_application') {
      summary.partnerApplications += 1
      if (event.related_record_id) {
        partnerApplicationPageIdsByApplicationId.set(
          event.related_record_id,
          dedupe([...(partnerApplicationPageIdsByApplicationId.get(event.related_record_id) ?? []), event.page_id])
        )
      }
    }

    if (event.event_type === 'partner_approved') {
      summary.approvedPartners += 1
    }

    if (event.event_type === 'partner_active') {
      summary.activePartners += 1
    }

    if (event.event_type === 'partner_generated_signup') {
      summary.partnerGeneratedSignups += 1
    }

    if (event.event_type === 'partner_generated_paid_client') {
      summary.partnerGeneratedPaidClients += 1
    }

    if (event.event_type === 'booked_call') {
      summary.bookedCalls += 1
    }

    if (event.event_type === 'paid_client') {
      summary.paidClients += 1
    }

    if (event.event_type === 'ai_citation') {
      summary.aiCitations += 1
      const eventDate = event.occurred_at.slice(0, 10)
      const currentTrend = citationTrendMap.get(eventDate) ?? { citations: 0, aiDrivenClicks: 0 }
      currentTrend.citations += 1
      citationTrendMap.set(eventDate, currentTrend)
    }
  }

  for (const payment of args.payments) {
    if (!payment.user_id) continue
    if (payment.payment_status && payment.payment_status !== 'paid') continue
    const amount = toNumber(payment.amount)
    if (!amount) continue

    const pageIds = signupPageIdsByUserId.get(payment.user_id) ?? []
    for (const pageId of pageIds) {
      const summary = pageSummaryMap.get(pageId)
      if (summary) {
        summary.revenue += amount
      }
    }
  }

  const approvedApplicationsByEmail = new Set(
    args.affiliateApplications
      .filter((row) => row.status === 'approved' && row.email)
      .map((row) => row.email!.toLowerCase())
  )
  const activeAffiliatesByEmail = new Set(
    args.affiliates
      .filter((row) => row.status === 'active' && row.email)
      .map((row) => row.email!.toLowerCase())
  )
  const affiliateIdByEmail = new Map(
    args.affiliates
      .filter((row) => row.email)
      .map((row) => [row.email!.toLowerCase(), row.id] as const)
  )

  for (const application of args.affiliateApplications) {
    if (!application.email) continue
    const pageIds = partnerApplicationPageIdsByApplicationId.get(application.id) ?? []
    for (const pageId of pageIds) {
      const summary = pageSummaryMap.get(pageId)
      if (!summary) continue
      const email = application.email.toLowerCase()
      if (approvedApplicationsByEmail.has(email)) {
        summary.approvedPartners += 1
      }
      if (activeAffiliatesByEmail.has(email)) {
        summary.activePartners += 1
      }
    }
  }

  const partnerPageIdsByAffiliateId = new Map<string, string[]>()
  for (const application of args.affiliateApplications) {
    if (!application.email) continue
    const affiliateId = affiliateIdByEmail.get(application.email.toLowerCase())
    if (!affiliateId) continue
    const pageIds = partnerApplicationPageIdsByApplicationId.get(application.id) ?? []
    partnerPageIdsByAffiliateId.set(
      affiliateId,
      dedupe([...(partnerPageIdsByAffiliateId.get(affiliateId) ?? []), ...pageIds])
    )
  }

  for (const referral of args.affiliateReferrals) {
    if (!referral.affiliate_id) continue
    const pageIds = partnerPageIdsByAffiliateId.get(referral.affiliate_id) ?? []
    for (const pageId of pageIds) {
      const summary = pageSummaryMap.get(pageId)
      if (!summary) continue
      if (referral.user_id) {
        summary.partnerGeneratedSignups += 1
      }
      if (referral.referral_status === 'active' || referral.subscription_active) {
        summary.partnerGeneratedPaidClients += 1
      }
    }
  }

  for (const commission of args.affiliateCommissions) {
    if (!commission.affiliate_id) continue
    if (commission.status === 'reversed') continue
    const amount = toNumber(commission.gross_amount)
    if (!amount) continue
    const pageIds = partnerPageIdsByAffiliateId.get(commission.affiliate_id) ?? []
    for (const pageId of pageIds) {
      const summary = pageSummaryMap.get(pageId)
      if (summary) {
        summary.partnerGeneratedRevenue += amount
      }
    }
  }

  const summaries = Array.from(pageSummaryMap.values()).map((summary) => {
    const latestMetric = latestMetricByPage.get(summary.pageId)
    const weightedMetricPosition = latestMetric?.average_position ?? null
    const indexedStatus = latestMetric?.indexed_status ?? 'unknown'
    return {
      ...summary,
      ctr: round(divide(summary.clicks, summary.impressions) * 100, 2),
      averagePosition: weightedMetricPosition !== null ? round(weightedMetricPosition, 2) : null,
      indexedStatus,
    }
  })

  const visibilityImpressions = summaries.reduce((sum, item) => sum + item.impressions, 0)
  const visibilityClicks = summaries.reduce((sum, item) => sum + item.clicks, 0)
  const indexedPages = summaries.filter((item) => isIndexedStatus(item.indexedStatus)).length
  const notIndexedPages = summaries.filter((item) => item.indexedStatus !== 'unknown' && !isIndexedStatus(item.indexedStatus)).length
  const positionRows = summaries.filter((item) => item.averagePosition !== null) as Array<ContentPerformancePageSummary & { averagePosition: number }>
  const weightedClicks = positionRows.reduce((sum, item) => sum + item.clicks, 0)
  const averagePosition = positionRows.length === 0
    ? null
    : round(
      weightedClicks > 0
        ? positionRows.reduce((sum, item) => sum + (item.averagePosition * item.clicks), 0) / weightedClicks
        : positionRows.reduce((sum, item) => sum + item.averagePosition, 0) / positionRows.length,
      2
    )

  const visibility: ContentVisibilityDashboard = {
    impressions: visibilityImpressions,
    clicks: visibilityClicks,
    ctr: round(divide(visibilityClicks, visibilityImpressions) * 100, 2),
    averagePosition,
    indexedPages,
    notIndexedPages,
    topPages: [...summaries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 8),
  }

  const aiVisibility: ContentAiVisibilityDashboard = {
    aiCitations: summaries.reduce((sum, item) => sum + item.aiCitations, 0),
    aiDrivenClicks: summaries.reduce((sum, item) => sum + item.aiDrivenClicks, 0),
    citationTrend: Array.from(citationTrendMap.entries())
      .map(([metricDate, values]) => ({
        metricDate,
        citations: values.citations,
        aiDrivenClicks: values.aiDrivenClicks,
      }))
      .sort((a, b) => a.metricDate.localeCompare(b.metricDate))
      .slice(-12),
    topCitedPages: [...summaries].sort((a, b) => b.aiCitations - a.aiCitations || b.aiDrivenClicks - a.aiDrivenClicks).slice(0, 8),
  }

  const conversions: ContentConversionDashboard = {
    portalClicks: summaries.reduce((sum, item) => sum + item.portalClicks, 0),
    getStartedSubmissions: summaries.reduce((sum, item) => sum + item.getStartedSubmissions, 0),
    signups: summaries.reduce((sum, item) => sum + item.signups, 0),
    bookedCalls: summaries.reduce((sum, item) => sum + item.bookedCalls, 0),
    paidClients: summaries.reduce((sum, item) => sum + item.paidClients, 0),
    topConversionPages: [...summaries].sort((a, b) =>
      (b.revenue - a.revenue) ||
      (b.paidClients - a.paidClients) ||
      (b.signups - a.signups) ||
      (b.getStartedSubmissions - a.getStartedSubmissions)
    ).slice(0, 8),
  }

  const partnerPages = summaries.filter((item) => item.motion === 'partner_recruitment')
  const partnerRecruitment: ContentPartnerDashboard = {
    partnerApplications: partnerPages.reduce((sum, item) => sum + item.partnerApplications, 0),
    approvedPartners: partnerPages.reduce((sum, item) => sum + item.approvedPartners, 0),
    activePartners: partnerPages.reduce((sum, item) => sum + item.activePartners, 0),
    partnerGeneratedSignups: partnerPages.reduce((sum, item) => sum + item.partnerGeneratedSignups, 0),
    partnerGeneratedPaidClients: partnerPages.reduce((sum, item) => sum + item.partnerGeneratedPaidClients, 0),
    partnerGeneratedRevenue: round(partnerPages.reduce((sum, item) => sum + item.partnerGeneratedRevenue, 0), 2),
    topPartnerPages: [...partnerPages].sort((a, b) =>
      (b.partnerGeneratedRevenue - a.partnerGeneratedRevenue) ||
      (b.activePartners - a.activePartners) ||
      (b.partnerApplications - a.partnerApplications)
    ).slice(0, 8),
  }

  const accumulateBreakdown = (
    rows: ContentPerformancePageSummary[],
    getKey: (row: ContentPerformancePageSummary) => string,
    getLabel: (row: ContentPerformancePageSummary) => string
  ) => {
    const map = new Map<string, ContentRevenueBreakdownRow>()
    for (const row of rows) {
      const key = getKey(row)
      const current = map.get(key) ?? {
        key,
        label: getLabel(row),
        revenue: 0,
        paidClients: 0,
        signups: 0,
        leads: 0,
      }
      current.revenue += row.revenue
      current.paidClients += row.paidClients
      current.signups += row.signups
      current.leads += row.getStartedSubmissions
      map.set(key, current)
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.paidClients - a.paidClients).slice(0, 10)
  }

  const revenue: ContentRevenueDashboard = {
    attributedRevenue: round(summaries.reduce((sum, item) => sum + item.revenue, 0), 2),
    paidClients: summaries.reduce((sum, item) => sum + item.paidClients, 0),
    revenueByPage: [...summaries].sort((a, b) => b.revenue - a.revenue || b.paidClients - a.paidClients).slice(0, 8),
    revenueByTopicCluster: accumulateBreakdown(summaries, (row) => row.topicCluster, (row) => slugToTitle(row.topicCluster)),
    revenueByIndustryPage: accumulateBreakdown(
      summaries.filter((row) => row.routeGroup === 'industries'),
      (row) => row.canonicalPath,
      (row) => row.title
    ),
  }

  return {
    visibility,
    aiVisibility,
    conversions,
    revenue,
    partnerRecruitment,
  }
}

export async function recordContentEvent(args: {
  pageId: string
  eventType: ContentEventType
  relatedRecordId?: string | null
  metadata?: JsonRecord
}) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('seo_content_events').insert({
    page_id: args.pageId,
    event_type: args.eventType,
    related_record_id: args.relatedRecordId ?? null,
    metadata: args.metadata ?? {},
    occurred_at: new Date().toISOString(),
  })

  if (error && !isMissingRelationError(error, 'seo_content_events')) {
    console.error('[content-engine] failed to record content event', error)
  }
}

export async function refreshDerivedContentAttribution() {
  const supabase = await createServiceClient()
  const [leadEventsRes, signupEventsRes, partnerApplicationEventsRes] = await Promise.all([
    supabase.from('seo_content_events').select('id, page_id, related_record_id, event_type').eq('event_type', 'lead'),
    supabase.from('seo_content_events').select('id, page_id, related_record_id, event_type').eq('event_type', 'signup'),
    supabase.from('seo_content_events').select('id, page_id, related_record_id, event_type').eq('event_type', 'partner_application'),
  ])

  if (leadEventsRes.error || signupEventsRes.error || partnerApplicationEventsRes.error) {
    if (
      isMissingRelationError(leadEventsRes.error, 'seo_content_events') ||
      isMissingRelationError(signupEventsRes.error, 'seo_content_events') ||
      isMissingRelationError(partnerApplicationEventsRes.error, 'seo_content_events')
    ) {
      return { bookedCalls: 0, paidClients: 0, approvedPartners: 0, activePartners: 0 }
    }
    throw leadEventsRes.error || signupEventsRes.error || partnerApplicationEventsRes.error
  }

  const leadIds = dedupe((leadEventsRes.data ?? []).map((row) => row.related_record_id).filter(Boolean) as string[])
  const userIds = dedupe((signupEventsRes.data ?? []).map((row) => row.related_record_id).filter(Boolean) as string[])

  const partnerApplicationIds = dedupe((partnerApplicationEventsRes.data ?? []).map((row) => row.related_record_id).filter(Boolean) as string[])
  const [crmLeadsRes, profilesRes, affiliateApplicationsRes, affiliatesRes, affiliateReferralsRes] = await Promise.all([
    leadIds.length > 0
      ? supabase.from('crm_leads').select('id, strategy_call_booked, converted_to_client').in('id', leadIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase.from('profiles').select('id, billing_status').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    partnerApplicationIds.length > 0
      ? supabase.from('affiliate_applications').select('id, email, status').in('id', partnerApplicationIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('affiliates').select('id, email, status').limit(5000),
    supabase.from('affiliate_referrals').select('affiliate_id, user_id, referral_status, subscription_active').limit(5000),
  ])

  if (crmLeadsRes.error) throw crmLeadsRes.error
  if (profilesRes.error) throw profilesRes.error
  if (affiliateApplicationsRes.error) throw affiliateApplicationsRes.error
  if (affiliatesRes.error) throw affiliatesRes.error
  if (affiliateReferralsRes.error) throw affiliateReferralsRes.error

  const bookedLeadIds = new Set((crmLeadsRes.data ?? []).filter((lead) => lead.strategy_call_booked).map((lead) => lead.id))
  const paidLeadIds = new Set((crmLeadsRes.data ?? []).filter((lead) => lead.converted_to_client).map((lead) => lead.id))
  const paidSignupUserIds = new Set((profilesRes.data ?? []).filter((profile) => ['active', 'trialing'].includes(profile.billing_status || '')).map((profile) => profile.id))
  const affiliateIdByEmail = new Map(
    ((affiliatesRes.data ?? []) as AffiliateRow[])
      .filter((row) => row.email)
      .map((row) => [row.email!.toLowerCase(), row.id] as const)
  )
  const activeAffiliateIds = new Set(
    ((affiliatesRes.data ?? []) as AffiliateRow[])
      .filter((row) => row.status === 'active')
      .map((row) => row.id)
  )

  let bookedCalls = 0
  let paidClients = 0
  let approvedPartners = 0
  let activePartners = 0

  for (const event of leadEventsRes.data ?? []) {
    if (event.related_record_id && bookedLeadIds.has(event.related_record_id)) {
      await supabase.from('seo_content_events').upsert({
        page_id: event.page_id,
        event_type: 'booked_call',
        related_record_id: event.related_record_id,
        metadata: { derived_from: 'crm_leads.strategy_call_booked' },
        occurred_at: new Date().toISOString(),
      }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      bookedCalls += 1
    }
    if (event.related_record_id && paidLeadIds.has(event.related_record_id)) {
      await supabase.from('seo_content_events').upsert({
        page_id: event.page_id,
        event_type: 'paid_client',
        related_record_id: event.related_record_id,
        metadata: { derived_from: 'crm_leads.converted_to_client' },
        occurred_at: new Date().toISOString(),
      }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      paidClients += 1
    }
  }

  for (const event of signupEventsRes.data ?? []) {
    if (event.related_record_id && paidSignupUserIds.has(event.related_record_id)) {
      await supabase.from('seo_content_events').upsert({
        page_id: event.page_id,
        event_type: 'paid_client',
        related_record_id: event.related_record_id,
        metadata: { derived_from: 'profiles.billing_status' },
        occurred_at: new Date().toISOString(),
      }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      paidClients += 1
    }
  }

  for (const event of partnerApplicationEventsRes.data ?? []) {
    const application = (affiliateApplicationsRes.data ?? []).find((row) => row.id === event.related_record_id)
    if (!application?.email) continue

    if (application.status === 'approved') {
      await supabase.from('seo_content_events').upsert({
        page_id: event.page_id,
        event_type: 'partner_approved',
        related_record_id: application.id,
        metadata: { derived_from: 'affiliate_applications.status' },
        occurred_at: new Date().toISOString(),
      }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      approvedPartners += 1
    }

    const affiliateId = affiliateIdByEmail.get(application.email.toLowerCase())
    if (!affiliateId) continue

    if (activeAffiliateIds.has(affiliateId)) {
      await supabase.from('seo_content_events').upsert({
        page_id: event.page_id,
        event_type: 'partner_active',
        related_record_id: affiliateId,
        metadata: { derived_from: 'affiliates.status' },
        occurred_at: new Date().toISOString(),
      }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      activePartners += 1
    }

    const referrals = ((affiliateReferralsRes.data ?? []) as AffiliateReferralRow[]).filter((row) => row.affiliate_id === affiliateId)
    for (const referral of referrals) {
      if (referral.user_id) {
        await supabase.from('seo_content_events').upsert({
          page_id: event.page_id,
          event_type: 'partner_generated_signup',
          related_record_id: referral.user_id,
          metadata: { derived_from: 'affiliate_referrals.user_id', affiliate_id: affiliateId },
          occurred_at: new Date().toISOString(),
        }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      }
      if (referral.user_id && (referral.referral_status === 'active' || referral.subscription_active)) {
        await supabase.from('seo_content_events').upsert({
          page_id: event.page_id,
          event_type: 'partner_generated_paid_client',
          related_record_id: referral.user_id,
          metadata: { derived_from: 'affiliate_referrals.referral_status', affiliate_id: affiliateId },
          occurred_at: new Date().toISOString(),
        }, { onConflict: 'page_id,event_type,related_record_id' }).then(() => {})
      }
    }
  }

  return { bookedCalls, paidClients, approvedPartners, activePartners }
}

export function getContentAttributionCookieValue(page: Pick<ContentPageRecord, 'id' | 'slug' | 'route_group' | 'title_tag'>) {
  return JSON.stringify({
    pageId: page.id,
    slug: page.slug,
    routeGroup: page.route_group,
    title: page.title_tag,
    path: getCanonicalPath(page.route_group, page.slug),
    capturedAt: new Date().toISOString(),
  })
}

export function parseContentAttributionCookie(raw: string | undefined) {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as {
      pageId?: string
      slug?: string
      routeGroup?: ContentRouteGroup
      title?: string
      path?: string
      capturedAt?: string
    }

    if (!parsed.pageId || !parsed.slug || !parsed.routeGroup) return null
    return parsed
  } catch {
    return null
  }
}
