/**
 * CRM Unified Search Utilities
 * 
 * Provides smart, ranked search across CRM leads with support for:
 * - Exact matches (email, phone, full name)
 * - Prefix/partial matches
 * - Fuzzy matching for close spelling variations
 * - Phone number normalization
 * - Result ranking by relevance
 */

// ─── Normalization Utilities ──────────────────────────────────────────────────

/**
 * Normalize a phone number to digits-only for matching
 * Removes all formatting: +, (, ), -, spaces, dots, etc.
 */
export function normalizePhoneForSearch(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Normalize a phone to E.164 format if possible (for exact matching)
 */
export function normalizePhoneE164(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = normalizePhoneForSearch(phone)
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 10 && !digits.startsWith('1')) return `+${digits}`
  return digits
}

/**
 * Normalize text for search: lowercase, trim whitespace
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text.toLowerCase().trim()
}

/**
 * Extract digits from phone for substring matching
 * Returns the last 10 digits (US numbers) or all digits
 */
export function extractPhoneDigits(phone: string | null | undefined): string {
  const digits = normalizePhoneForSearch(phone)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

// ─── Match Detection Utilities ────────────────────────────────────────────────

export type MatchField = 'email' | 'phone' | 'full_name' | 'first_name' | 'last_name' | 'business_name' | 'fuzzy'

export interface SearchMatch {
  field: MatchField
  score: number  // Higher = better match
  matched: string  // The actual matched text
  query: string    // The original query that matched
}

export interface ScoredLead<T> {
  lead: T
  matches: SearchMatch[]
  primaryMatch: MatchField
  score: number
}

/**
 * Check if query is an email address pattern
 */
export function isEmailQuery(query: string): boolean {
  return query.includes('@') && query.includes('.')
}

/**
 * Check if query is a phone pattern (mostly digits after removing formatting)
 */
export function isPhoneQuery(query: string): boolean {
  const digits = query.replace(/\D/g, '')
  return digits.length >= 7
}

/**
 * Check if query looks like a full name (two words, likely first+last)
 */
export function isFullNameQuery(query: string): boolean {
  const parts = query.trim().split(/\s+/)
  return parts.length >= 2
}

// ─── Matching Functions ──────────────────────────────────────────────────────

/**
 * Score an email field match
 */
export function scoreEmailMatch(
  query: string,
  email: string | null | undefined,
  exactOnly: boolean = false
): SearchMatch | null {
  if (!email) return null
  const normalizedEmail = normalizeText(email)
  const normalizedQuery = normalizeText(query)
  
  // Exact match (case-insensitive)
  if (normalizedEmail === normalizedQuery) {
    return { field: 'email', score: 100, matched: email, query }
  }
  
  if (exactOnly) return null
  
  // Contains match (for partial email search like "gmail.com" or "john@")
  if (normalizedEmail.includes(normalizedQuery)) {
    return { field: 'email', score: 60, matched: email, query }
  }
  
  return null
}

/**
 * Score a phone field match
 * Handles various phone formats and normalizes for comparison
 */
export function scorePhoneMatch(
  query: string,
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
  exactOnly: boolean = false
): SearchMatch | null {
  if (!phone && !phoneE164) return null
  
  const queryDigits = normalizePhoneForSearch(query)
  const phoneDigits = normalizePhoneForSearch(phone)
  const e164Digits = phoneE164 ? normalizePhoneForSearch(phoneE164) : ''
  
  // Exact digit match (normalized)
  if (phoneDigits === queryDigits || e164Digits === queryDigits) {
    return { field: 'phone', score: 100, matched: phone ?? phoneE164 ?? '', query }
  }
  
  if (exactOnly) return null
  
  // Phone ends with query (for when user types last 4-7 digits)
  if (phoneDigits.endsWith(queryDigits) && queryDigits.length >= 4) {
    return { field: 'phone', score: 70, matched: phone ?? '', query }
  }
  
  // Query contains phone digits
  if (queryDigits.includes(phoneDigits) && phoneDigits.length >= 7) {
    return { field: 'phone', score: 50, matched: phone ?? '', query }
  }
  
  // Phone contains query digits (partial match)
  if (phoneDigits.includes(queryDigits) && queryDigits.length >= 4) {
    return { field: 'phone', score: 40, matched: phone ?? '', query }
  }
  
  return null
}

/**
 * Score a name field match
 */
export function scoreNameMatch(
  query: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  exactOnly: boolean = false
): { fullNameMatch: SearchMatch | null; firstNameMatch: SearchMatch | null; lastNameMatch: SearchMatch | null } {
  const normalizedFirst = normalizeText(firstName)
  const normalizedLast = normalizeText(lastName)
  const fullName = `${normalizedFirst} ${normalizedLast}`.trim()
  const normalizedQuery = normalizeText(query)
  
  let fullNameMatch: SearchMatch | null = null
  let firstNameMatch: SearchMatch | null = null
  let lastNameMatch: SearchMatch | null = null
  
  // Exact full name match
  if (fullName === normalizedQuery) {
    fullNameMatch = { field: 'full_name', score: 95, matched: `${firstName} ${lastName}`.trim(), query }
  }
  
  // Exact first or last name match
  if (normalizedFirst === normalizedQuery) {
    firstNameMatch = { field: 'first_name', score: 90, matched: firstName ?? '', query }
  }
  
  if (normalizedLast === normalizedQuery) {
    lastNameMatch = { field: 'last_name', score: 90, matched: lastName ?? '', query }
  }
  
  if (exactOnly) return { fullNameMatch, firstNameMatch, lastNameMatch }
  
  // Prefix/starts-with matches (partial)
  if (normalizedFirst.startsWith(normalizedQuery) && normalizedQuery.length >= 2) {
    firstNameMatch = { field: 'first_name', score: 60, matched: firstName ?? '', query }
  }
  
  if (normalizedLast.startsWith(normalizedQuery) && normalizedQuery.length >= 2) {
    lastNameMatch = { field: 'last_name', score: 60, matched: lastName ?? '', query }
  }
  
  if (fullName.startsWith(normalizedQuery) && normalizedQuery.length >= 2) {
    fullNameMatch = { field: 'full_name', score: 70, matched: `${firstName} ${lastName}`.trim(), query }
  }
  
  // Contains matches
  if (fullName.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    fullNameMatch = { field: 'full_name', score: 50, matched: `${firstName} ${lastName}`.trim(), query }
  }
  
  if (normalizedFirst.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    firstNameMatch = { field: 'first_name', score: 40, matched: firstName ?? '', query }
  }
  
  if (normalizedLast.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    lastNameMatch = { field: 'last_name', score: 40, matched: lastName ?? '', query }
  }
  
  return { fullNameMatch, firstNameMatch, lastNameMatch }
}

/**
 * Score a business name match
 */
export function scoreBusinessMatch(
  query: string,
  businessName: string | null | undefined,
  exactOnly: boolean = false
): SearchMatch | null {
  if (!businessName) return null
  
  const normalizedBusiness = normalizeText(businessName)
  const normalizedQuery = normalizeText(query)
  
  // Exact match
  if (normalizedBusiness === normalizedQuery) {
    return { field: 'business_name', score: 85, matched: businessName, query }
  }
  
  if (exactOnly) return null
  
  // Starts with (prefix match)
  if (normalizedBusiness.startsWith(normalizedQuery) && normalizedQuery.length >= 2) {
    return { field: 'business_name', score: 60, matched: businessName, query }
  }
  
  // Contains
  if (normalizedBusiness.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    return { field: 'business_name', score: 40, matched: businessName, query }
  }
  
  return null
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Score fuzzy name matches
 * Used as fallback when no exact/partial matches found
 */
export function scoreFuzzyMatch(
  query: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  businessName: string | null | undefined
): SearchMatch | null {
  if (!query || query.length < 3) return null
  
  const normalizedQuery = normalizeText(query)
  const candidates: { text: string; field: MatchField }[] = []
  
  if (firstName) candidates.push({ text: normalizeText(firstName), field: 'first_name' })
  if (lastName) candidates.push({ text: normalizeText(lastName), field: 'last_name' })
  if (businessName) candidates.push({ text: normalizeText(businessName), field: 'business_name' })
  
  let bestScore = 0
  let bestMatch: SearchMatch | null = null
  
  for (const candidate of candidates) {
    // Use a length-based threshold for fuzzy matching
    // Allow more distance for longer strings
    const maxDistance = Math.max(1, Math.floor(candidate.text.length / 4))
    const distance = levenshteinDistance(normalizedQuery, candidate.text)
    
    if (distance <= maxDistance) {
      // Score based on distance relative to max allowed
      const relativeScore = 1 - (distance / (maxDistance + 1))
      const fuzzyScore = Math.round(relativeScore * 30) // Fuzzy scores capped at 30
      
      if (fuzzyScore > bestScore) {
        bestScore = fuzzyScore
        bestMatch = { field: 'fuzzy', score: fuzzyScore, matched: candidate.text, query }
      }
    }
  }
  
  return bestMatch
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

export interface LeadSearchFields {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  phone_e164?: string | null
  business_name: string | null
}

export interface UnifiedSearchResult<T extends LeadSearchFields> {
  lead: T
  matches: SearchMatch[]
  primaryMatch: MatchField
  score: number
}

/**
 * Score a single lead against a search query
 */
export function scoreLead<T extends LeadSearchFields>(
  lead: T,
  query: string,
  options: { exactOnly?: boolean; enableFuzzy?: boolean } = {}
): UnifiedSearchResult<T> | null {
  const { exactOnly = false, enableFuzzy = true } = options
  
  if (!query || query.trim().length === 0) return null
  
  const trimmedQuery = query.trim()
  
  // Run all matchers
  const emailMatch = scoreEmailMatch(trimmedQuery, lead.email, exactOnly)
  const phoneMatch = scorePhoneMatch(trimmedQuery, lead.phone, lead.phone_e164, exactOnly)
  const nameMatches = scoreNameMatch(trimmedQuery, lead.first_name, lead.last_name, exactOnly)
  const businessMatch = scoreBusinessMatch(trimmedQuery, lead.business_name, exactOnly)
  const fuzzyMatch = (!exactOnly && enableFuzzy)
    ? scoreFuzzyMatch(trimmedQuery, lead.first_name, lead.last_name, lead.business_name)
    : null
  
  // Collect all matches
  const matches: SearchMatch[] = [
    emailMatch,
    phoneMatch,
    nameMatches.fullNameMatch,
    nameMatches.firstNameMatch,
    nameMatches.lastNameMatch,
    businessMatch,
    fuzzyMatch,
  ].filter((m): m is SearchMatch => m !== null)
  
  if (matches.length === 0) return null
  
  // Determine primary match (highest priority field, highest score for ties)
  const matchPriority: Record<MatchField, number> = {
    email: 1,
    phone: 2,
    full_name: 3,
    first_name: 4,
    last_name: 4,
    business_name: 5,
    fuzzy: 6,
  }
  
  const sortedMatches = [...matches].sort((a, b) => {
    const priorityDiff = matchPriority[a.field] - matchPriority[b.field]
    if (priorityDiff !== 0) return priorityDiff
    return b.score - a.score
  })
  
  const primaryMatch = sortedMatches[0].field
  const score = sortedMatches[0].score
  
  return {
    lead,
    matches,
    primaryMatch,
    score,
  }
}

/**
 * Rank and filter leads for unified search
 * 
 * Ranking order:
 * 1. Exact email match (100)
 * 2. Exact phone match (100)
 * 3. Exact full name match (95)
 * 4. Exact first/last name match (90)
 * 5. Prefix matches (60-70)
 * 6. Contains/partial matches (40-50)
 * 7. Fuzzy matches (up to 30)
 */
export function rankSearchResults<T extends LeadSearchFields>(
  leads: T[],
  query: string,
  options: { exactOnly?: boolean; enableFuzzy?: boolean; limit?: number } = {}
): UnifiedSearchResult<T>[] {
  const { limit = 100 } = options
  
  // Score all leads
  const scored = leads
    .map(lead => scoreLead(lead, query, options))
    .filter((r): r is UnifiedSearchResult<T> => r !== null)
  
  // Sort by score descending, then by primary match priority
  const matchPriority: Record<MatchField, number> = {
    email: 1,
    phone: 2,
    full_name: 3,
    first_name: 4,
    last_name: 4,
    business_name: 5,
    fuzzy: 6,
  }
  
  scored.sort((a, b) => {
    // Primary score comparison
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff
    
    // Secondary: match priority (email before phone, etc.)
    const priorityDiff = matchPriority[a.primaryMatch] - matchPriority[b.primaryMatch]
    if (priorityDiff !== 0) return priorityDiff
    
    // Tertiary: exact match bonus
    const aExact = a.matches.some(m => m.score === 100) ? 1 : 0
    const bExact = b.matches.some(m => m.score === 100) ? 1 : 0
    return bExact - aExact
  })
  
  return scored.slice(0, limit)
}

/**
 * Determine which search strategy to use based on query characteristics
 */
export function analyzeQuery(query: string): {
  type: 'email' | 'phone' | 'full_name' | 'partial'
  query: string
} {
  const trimmed = query.trim()
  
  if (isEmailQuery(trimmed)) {
    return { type: 'email', query: trimmed }
  }
  
  if (isPhoneQuery(trimmed)) {
    return { type: 'phone', query: trimmed }
  }
  
  if (isFullNameQuery(trimmed)) {
    return { type: 'full_name', query: trimmed }
  }
  
  return { type: 'partial', query: trimmed }
}
