/**
 * Industry classification constants and helpers for the Dialer.
 * Used by lead-processor, agent-run, and the leads API to filter/tag leads.
 */

// ─── Blacklisted: Government / Non-profit (cannot fund) ──────────────────────
export const BLACKLISTED_INDUSTRY_TERMS = [
  'government', ' gov ', '.gov', 'federal', 'state of ', 'city of ', 'county of ',
  'department of ', 'dept of ', 'office of ',
  'non-profit', 'nonprofit', 'non profit', '501(c)', '501c3', 'charity', 'foundation',
  'fire department', 'fire dept', 'fire station', 'fire district',
  'county office', 'county clerk', 'county sheriff',
  'public works', 'public school', 'school district', 'unified school',
  'municipality', 'municipal', 'township', 'city hall',
  'police department', 'police dept', 'sheriff', 'corrections',
  'veterans affairs', 'social services', 'housing authority',
  'sanitation district', 'water district', 'utility district',
  'community college', 'state university', 'public library',
]

// ─── High-priority industries (strong funding candidates) ────────────────────
export const PRIORITY_INDUSTRIES = [
  'Construction',
  'E-commerce',
  'Transportation/Trucking',
  'Real Estate',
  'Healthcare',
  'Professional Services',
  'Retail',
  'Restaurants/Food',
  'Manufacturing',
  'Auto/Automotive',
]

// ─── Inference map: keyword → industry label ─────────────────────────────────
const INFERENCE_MAP: Array<{ keywords: string[]; industry: string }> = [
  { keywords: ['construc', 'contractor', 'contracting', 'builder', 'remodel', 'renovation', 'roofing', 'plumbing', 'hvac', 'electrician', 'flooring', 'concrete', 'landscap', 'paving', 'masonry', 'cabinet', 'drywall', 'excavat'], industry: 'Construction' },
  { keywords: ['truck', 'transport', 'freight', 'logistics', 'hauling', 'courier', 'dispatch', 'delivery', 'moving', 'carrier', 'shipping'], industry: 'Transportation/Trucking' },
  { keywords: ['real estate', 'realty', 'realtor', 'properties', 'property mgmt', 'property management', 'homes for sale', 'apartment', 'housing'], industry: 'Real Estate' },
  { keywords: ['medical', 'clinic', 'dental', 'dentist', 'therapy', 'therapist', 'healthcare', 'health care', 'chiro', 'optom', 'pharmacy', 'urgent care', 'physical therapy', 'rehabilitation', 'veterinar', 'dermatol', 'cardiolog', 'orthoped'], industry: 'Healthcare' },
  { keywords: ['ecommerce', 'e-commerce', 'online store', 'shopify', 'etsy', 'amazon seller', 'dropship'], industry: 'E-commerce' },
  { keywords: ['restaurant', 'cafe', 'catering', 'bakery', 'diner', 'pizza', 'sushi', 'grill', 'bbq', 'taco', 'food service', 'bistro', 'eatery', 'bar and grill'], industry: 'Restaurants/Food' },
  { keywords: ['auto ', 'auto repair', 'automotive', 'car wash', 'mechanic', 'tire', 'dealership', 'body shop', 'collision'], industry: 'Auto/Automotive' },
  { keywords: ['manufactur', 'fabricat', 'machining', 'assembly', 'production', 'industrial', 'welding'], industry: 'Manufacturing' },
  { keywords: ['retail', 'store', 'boutique', 'shop ', 'outlet', 'supplies', 'supply'], industry: 'Retail' },
  { keywords: ['consult', 'advisory', 'solutions', 'services', 'group', 'associates', 'partners', 'firm', 'agency', 'staffing', 'marketing', 'accounting', 'cpa', 'attorney', 'law office', 'legal', 'insurance'], industry: 'Professional Services' },
  { keywords: ['school', 'academy', 'learning', 'education', 'tutoring', 'childcare', 'daycare', 'preschool'], industry: 'Education/Childcare' },
  { keywords: ['salon', 'barber', 'spa', 'beauty', 'nail ', 'hair ', 'lash', 'wellness', 'fitness', 'gym', 'yoga', 'crossfit'], industry: 'Beauty/Wellness' },
  { keywords: ['church', 'ministry', 'chapel', 'temple', 'mosque', 'synagogue', 'faith', 'worship'], industry: 'Religious Organization' },
]

/**
 * Infer an industry label from a company name using keyword matching.
 * Returns null if no match found.
 */
export function inferIndustryFromCompany(businessName: string | null | undefined): string | null {
  if (!businessName) return null
  const lower = businessName.toLowerCase()
  for (const entry of INFERENCE_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.industry
    }
  }
  return null
}

/**
 * Returns true if this lead's industry or company name matches a blacklisted term.
 * Blacklisted = government, non-profit, fire dept, county office, public works, municipality.
 */
export function isBlacklistedIndustry(lead: {
  industry?: string | null
  business_name?: string | null
}): boolean {
  const haystack = `${lead.industry ?? ''} ${lead.business_name ?? ''}`.toLowerCase()
  for (const term of BLACKLISTED_INDUSTRY_TERMS) {
    if (haystack.includes(term)) return true
  }
  return false
}

/**
 * Returns the badge display config for a given industry label.
 */
export function getIndustryBadge(industry: string | null | undefined): {
  label: string
  color: string
  priority: boolean
} {
  if (!industry) return { label: 'Unknown', color: 'bg-gray-700 text-gray-400', priority: false }
  const isPriority = PRIORITY_INDUSTRIES.includes(industry)
  if (isPriority) return { label: industry, color: 'bg-indigo-900 text-indigo-300 border border-indigo-700', priority: true }
  if (industry === 'Religious Organization') return { label: industry, color: 'bg-gray-700 text-gray-400', priority: false }
  return { label: industry, color: 'bg-gray-800 text-gray-400', priority: false }
}
