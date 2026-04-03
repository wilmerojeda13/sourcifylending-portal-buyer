export const CONTENT_ROUTE_GROUPS = [
  'services',
  'industries',
  'answers',
  'comparisons',
  'locations',
  'portal-guides',
  'problems',
  'partners',
  'partner-personas',
  'partner-earnings',
  'partner-guides',
  'partner-comparisons',
  'partner-faqs',
  'partner-case-studies',
] as const

export type ContentRouteGroup = typeof CONTENT_ROUTE_GROUPS[number]

export const CONTENT_TEMPLATE_TYPES = [
  'service_page',
  'industry_page',
  'answer_page',
  'comparison_page',
  'local_page',
  'portal_guide_page',
  'problem_page',
  'partner_program_page',
  'partner_persona_page',
  'partner_earnings_page',
  'partner_guide_page',
  'partner_comparison_page',
  'partner_faq_page',
  'partner_case_study_page',
] as const

export type ContentTemplateType = typeof CONTENT_TEMPLATE_TYPES[number]

export const CONTENT_WORKFLOW_STATUSES = [
  'draft',
  'review',
  'approved',
  'published',
  'needs_refresh',
  'archived',
] as const

export type ContentWorkflowStatus = typeof CONTENT_WORKFLOW_STATUSES[number]

export const CONTENT_IDEA_STATUSES = [
  'new',
  'clustered',
  'briefed',
  'drafted',
  'ignored',
] as const

export type ContentIdeaStatus = typeof CONTENT_IDEA_STATUSES[number]

export const CONTENT_METRIC_SOURCES = [
  'gsc',
  'bing_webmaster',
  'bing_ai',
  'internal',
] as const

export type ContentMetricSource = typeof CONTENT_METRIC_SOURCES[number]

export const CONTENT_EVENT_TYPES = [
  'visit',
  'lead',
  'signup',
  'booked_call',
  'paid_client',
  'indexnow_submission',
  'ai_citation',
  'partner_application',
  'partner_approved',
  'partner_active',
  'partner_generated_signup',
  'partner_generated_paid_client',
] as const

export type ContentEventType = typeof CONTENT_EVENT_TYPES[number]

export const CONTENT_MOTIONS = [
  'client_acquisition',
  'partner_recruitment',
] as const

export type ContentMotion = typeof CONTENT_MOTIONS[number]

type JsonRecord = Record<string, unknown>

export interface ContentSection {
  heading: string
  body: string
  bullets?: string[]
  table?: {
    headers: string[]
    rows: string[][]
  }
}

export interface ContentFaqItem {
  question: string
  answer: string
}

export interface ContentCtaBlock {
  title: string
  body: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel?: string | null
  secondaryHref?: string | null
}

export interface ContentInternalLink {
  label: string
  href: string
  reason?: string
}

export interface ContentIdea {
  id: string
  topic: string
  cluster_key: string
  buyer_intent: string
  suggested_content_type: ContentTemplateType
  source_type: string
  source_record_id: string | null
  evidence_excerpt: string | null
  keywords: string[] | null
  priority_score: number | null
  status: ContentIdeaStatus
  metadata: JsonRecord | null
  created_at: string
  updated_at: string
}

export interface ContentPageRecord {
  id: string
  route_group: ContentRouteGroup
  content_type: ContentTemplateType
  slug: string
  canonical_path: string
  title_tag: string
  meta_description: string
  h1: string
  hero_summary: string
  brief_summary: string | null
  buyer_intent: string | null
  target_keywords: string[] | null
  workflow_status: ContentWorkflowStatus
  intro_text: string | null
  body_sections: ContentSection[] | null
  faq_items: ContentFaqItem[] | null
  cta_blocks: ContentCtaBlock[] | null
  trust_points: string[] | null
  comparison_rows: { feature: string; sourcify: string; alternative: string }[] | null
  internal_links: ContentInternalLink[] | null
  schema_type: string | null
  schema_json: JsonRecord | null
  author_name: string | null
  reviewer_notes: string | null
  freshness_label: string | null
  quality_score: number | null
  quality_issues: string[] | null
  allow_auto_refresh: boolean | null
  source_signals: JsonRecord[] | null
  published_at: string | null
  last_updated_at: string | null
  refresh_due_at: string | null
  created_at: string
  updated_at: string
}

export interface ContentMetricRecord {
  id: string
  page_id: string
  metric_date: string
  source: ContentMetricSource
  impressions: number | null
  clicks: number | null
  average_position: number | null
  ai_citations: number | null
  indexed_status: string | null
  leads: number | null
  signups: number | null
  booked_calls: number | null
  paid_clients: number | null
  metadata: JsonRecord | null
}

export interface ContentPerformancePageSummary {
  pageId: string
  title: string
  canonicalPath: string
  routeGroup: ContentRouteGroup
  motion: ContentMotion
  workflowStatus: ContentWorkflowStatus
  topicCluster: string
  impressions: number
  clicks: number
  ctr: number
  averagePosition: number | null
  indexedStatus: string
  aiCitations: number
  aiDrivenClicks: number
  portalClicks: number
  getStartedSubmissions: number
  signups: number
  bookedCalls: number
  paidClients: number
  revenue: number
  partnerApplications: number
  approvedPartners: number
  activePartners: number
  partnerGeneratedSignups: number
  partnerGeneratedPaidClients: number
  partnerGeneratedRevenue: number
}

export interface ContentVisibilityDashboard {
  impressions: number
  clicks: number
  ctr: number
  averagePosition: number | null
  indexedPages: number
  notIndexedPages: number
  topPages: ContentPerformancePageSummary[]
}

export interface ContentAiVisibilityDashboard {
  aiCitations: number
  aiDrivenClicks: number
  citationTrend: Array<{ metricDate: string; citations: number; aiDrivenClicks: number }>
  topCitedPages: ContentPerformancePageSummary[]
}

export interface ContentConversionDashboard {
  portalClicks: number
  getStartedSubmissions: number
  signups: number
  bookedCalls: number
  paidClients: number
  topConversionPages: ContentPerformancePageSummary[]
}

export interface ContentPartnerDashboard {
  partnerApplications: number
  approvedPartners: number
  activePartners: number
  partnerGeneratedSignups: number
  partnerGeneratedPaidClients: number
  partnerGeneratedRevenue: number
  topPartnerPages: ContentPerformancePageSummary[]
}

export interface ContentRevenueBreakdownRow {
  key: string
  label: string
  revenue: number
  paidClients: number
  signups: number
  leads: number
}

export interface ContentRevenueDashboard {
  attributedRevenue: number
  paidClients: number
  revenueByPage: ContentPerformancePageSummary[]
  revenueByTopicCluster: ContentRevenueBreakdownRow[]
  revenueByIndustryPage: ContentRevenueBreakdownRow[]
}

export interface ContentDashboardSnapshot {
  visibility: ContentVisibilityDashboard
  aiVisibility: ContentAiVisibilityDashboard
  conversions: ContentConversionDashboard
  revenue: ContentRevenueDashboard
  partnerRecruitment: ContentPartnerDashboard
}

export interface ContentUpdateRecord {
  id: string
  page_id: string
  update_type: string
  summary: string
  metadata: JsonRecord | null
  created_by: string | null
  created_at: string
}

export interface ContentSnapshot {
  pages: ContentPageRecord[]
  topicIdeas: ContentIdea[]
  metrics: ContentMetricRecord[]
  updates: ContentUpdateRecord[]
  dashboards: ContentDashboardSnapshot
  schemaMissing: boolean
}

export interface ContentPageSeed {
  routeGroup: ContentRouteGroup
  contentType: ContentTemplateType
  slug: string
  topic: string
  motion: ContentMotion
  buyerIntent: string
  primaryKeyword: string
  secondaryKeywords: string[]
  locationName?: string
  industryName?: string
}

const ROUTE_GROUP_LABELS: Record<ContentRouteGroup, string> = {
  services: 'Services',
  industries: 'Industries',
  answers: 'Answers',
  comparisons: 'Comparisons',
  locations: 'Locations',
  'portal-guides': 'Portal Guides',
  problems: 'Problems',
  partners: 'Partner Program',
  'partner-personas': 'Partner Personas',
  'partner-earnings': 'Partner Earnings',
  'partner-guides': 'Partner Guides',
  'partner-comparisons': 'Partner Comparisons',
  'partner-faqs': 'Partner FAQs',
  'partner-case-studies': 'Partner Case Studies',
}

export function getContentRouteLabel(routeGroup: ContentRouteGroup) {
  return ROUTE_GROUP_LABELS[routeGroup]
}

export function getContentMotion(routeGroup: ContentRouteGroup): ContentMotion {
  return routeGroup.startsWith('partner') ? 'partner_recruitment' : 'client_acquisition'
}
