import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePhoneForSearch,
  normalizePhoneE164,
  normalizeText,
  scoreEmailMatch,
  scorePhoneMatch,
  scoreNameMatch,
  scoreBusinessMatch,
  scoreFuzzyMatch,
  rankSearchResults,
  analyzeQuery,
  isEmailQuery,
  isPhoneQuery,
  isFullNameQuery,
} from '@/lib/crm-unified-search'

// ─── Normalization Tests ──────────────────────────────────────────────────────

test('normalizePhoneForSearch removes all non-digits', () => {
  assert.equal(normalizePhoneForSearch('+1 (555) 123-4567'), '15551234567')
  assert.equal(normalizePhoneForSearch('555.123.4567'), '5551234567')
  assert.equal(normalizePhoneForSearch('555-123-4567'), '5551234567')
  assert.equal(normalizePhoneForSearch('5551234567'), '5551234567')
  assert.equal(normalizePhoneForSearch(null), '')
  assert.equal(normalizePhoneForSearch(undefined), '')
  assert.equal(normalizePhoneForSearch(''), '')
})

test('normalizePhoneE164 converts US numbers to E.164 format', () => {
  assert.equal(normalizePhoneE164('(555) 123-4567'), '+15551234567')
  assert.equal(normalizePhoneE164('5551234567'), '+15551234567')
  assert.equal(normalizePhoneE164('15551234567'), '+15551234567')
  assert.equal(normalizePhoneE164('+15551234567'), '+15551234567')
  assert.equal(normalizePhoneE164(null), '')
})

test('normalizeText lowercases and trims', () => {
  assert.equal(normalizeText('  John Smith  '), 'john smith')
  assert.equal(normalizeText('JOHN'), 'john')
  assert.equal(normalizeText(null), '')
  assert.equal(normalizeText(undefined), '')
})

// ─── Query Type Detection Tests ───────────────────────────────────────────────

test('isEmailQuery detects email patterns', () => {
  assert.equal(isEmailQuery('john@example.com'), true)
  assert.equal(isEmailQuery('john.smith@company.co.uk'), true)
  assert.equal(isEmailQuery('john'), false)
  assert.equal(isEmailQuery('5551234567'), false)
  assert.equal(isEmailQuery('john@'), true)
  assert.equal(isEmailQuery('@example'), false)
})

test('isPhoneQuery detects phone patterns', () => {
  assert.equal(isPhoneQuery('5551234567'), true)
  assert.equal(isPhoneQuery('+15551234567'), true)
  assert.equal(isPhoneQuery('(555) 123-4567'), true)
  assert.equal(isPhoneQuery('123456'), false) // Too short
  assert.equal(isPhoneQuery('john'), false)
})

test('isFullNameQuery detects two-word names', () => {
  assert.equal(isFullNameQuery('John Smith'), true)
  assert.equal(isFullNameQuery('John'), false)
  assert.equal(isFullNameQuery('John Michael Smith'), true)
  assert.equal(isFullNameQuery('John Michael'), true)
})

test('analyzeQuery classifies query types correctly', () => {
  const emailResult = analyzeQuery('john@example.com')
  assert.equal(emailResult.type, 'email')
  
  const phoneResult = analyzeQuery('5551234567')
  assert.equal(phoneResult.type, 'phone')
  
  const nameResult = analyzeQuery('John Smith')
  assert.equal(nameResult.type, 'full_name')
  
  const partialResult = analyzeQuery('acme')
  assert.equal(partialResult.type, 'partial')
})

// ─── Email Match Tests ────────────────────────────────────────────────────────

test('scoreEmailMatch finds exact matches', () => {
  const match = scoreEmailMatch('john@example.com', 'john@example.com')
  assert.notEqual(match, null)
  assert.equal(match!.score, 100)
  assert.equal(match!.field, 'email')
  
  // Case insensitive
  const matchUpper = scoreEmailMatch('JOHN@EXAMPLE.COM', 'john@example.com')
  assert.notEqual(matchUpper, null)
  assert.equal(matchUpper!.score, 100)
})

test('scoreEmailMatch finds partial matches', () => {
  const match = scoreEmailMatch('example.com', 'john@example.com')
  assert.notEqual(match, null)
  assert.equal(match!.score, 60)
  
  const matchPrefix = scoreEmailMatch('john@', 'john@example.com')
  assert.notEqual(matchPrefix, null)
  assert.equal(matchPrefix!.score, 60)
})

test('scoreEmailMatch returns null for non-matches', () => {
  const match = scoreEmailMatch('different', 'john@example.com')
  assert.equal(match, null)
  
  const matchNull = scoreEmailMatch('john@example.com', null)
  assert.equal(matchNull, null)
})

test('scoreEmailMatch exactOnly mode', () => {
  const match = scoreEmailMatch('example.com', 'john@example.com', true)
  assert.equal(match, null)
  
  const exactMatch = scoreEmailMatch('john@example.com', 'john@example.com', true)
  assert.notEqual(exactMatch, null)
})

// ─── Phone Match Tests ────────────────────────────────────────────────────────

test('scorePhoneMatch finds exact digit matches', () => {
  const match = scorePhoneMatch('5551234567', '+1 (555) 123-4567', '+15551234567')
  assert.notEqual(match, null)
  assert.equal(match!.score, 100)
  assert.equal(match!.field, 'phone')
})

test('scorePhoneMatch handles various phone formats', () => {
  // Query with formatting
  const match1 = scorePhoneMatch('(555) 123-4567', '5551234567', null)
  assert.notEqual(match1, null)
  assert.equal(match1!.score, 100)
  
  // Query without formatting
  const match2 = scorePhoneMatch('5551234567', '+15551234567', null)
  assert.notEqual(match2, null)
  assert.equal(match2!.score, 100)
})

test('scorePhoneMatch finds last 7 digits matches', () => {
  const match = scorePhoneMatch('1234567', '+15551234567', null)
  assert.notEqual(match, null)
  assert.equal(match!.score, 70)
})

test('scorePhoneMatch handles partial matches', () => {
  // Phone contains query
  const match = scorePhoneMatch('1234', '+15551234567', null)
  assert.notEqual(match, null)
  assert.equal(match!.score, 40)
  
  // Query contains full phone digits
  const match2 = scorePhoneMatch('15551234567', '5551234567', null)
  assert.notEqual(match2, null)
  assert.equal(match2!.score, 50)
})

test('scorePhoneMatch requires minimum 4 digits for partial', () => {
  const match = scorePhoneMatch('123', '+15551234567', null)
  assert.equal(match, null)
})

// ─── Name Match Tests ────────────────────────────────────────────────────────

test('scoreNameMatch finds exact full name', () => {
  const result = scoreNameMatch('John Smith', 'John', 'Smith')
  assert.notEqual(result.fullNameMatch, null)
  assert.equal(result.fullNameMatch!.score, 95)
  assert.equal(result.fullNameMatch!.field, 'full_name')
  
  // Case insensitive
  const resultUpper = scoreNameMatch('JOHN SMITH', 'John', 'Smith')
  assert.notEqual(resultUpper.fullNameMatch, null)
})

test('scoreNameMatch finds exact first/last name', () => {
  const firstMatch = scoreNameMatch('John', 'John', 'Smith')
  assert.notEqual(firstMatch.firstNameMatch, null)
  assert.equal(firstMatch.firstNameMatch!.score, 90)
  
  const lastMatch = scoreNameMatch('Smith', 'John', 'Smith')
  assert.notEqual(lastMatch.lastNameMatch, null)
  assert.equal(lastMatch.lastNameMatch!.score, 90)
})

test('scoreNameMatch finds prefix matches', () => {
  const result = scoreNameMatch('Jo', 'John', 'Smith')
  assert.notEqual(result.firstNameMatch, null)
  assert.equal(result.firstNameMatch!.score, 60)
  
  // Requires at least 2 characters
  const shortResult = scoreNameMatch('J', 'John', 'Smith')
  assert.equal(shortResult.firstNameMatch, null)
})

test('scoreNameMatch finds contains matches', () => {
  const result = scoreNameMatch('ohn', 'John', 'Smith')
  assert.notEqual(result.firstNameMatch, null)
  assert.equal(result.firstNameMatch!.score, 40)
  
  // Requires at least 3 characters
  const shortResult = scoreNameMatch('oh', 'John', 'Smith')
  assert.equal(shortResult.firstNameMatch, null)
})

test('scoreNameMatch exactOnly mode', () => {
  const result = scoreNameMatch('ohn', 'John', 'Smith', true)
  assert.equal(result.fullNameMatch, null)
  assert.equal(result.firstNameMatch, null)
})

// ─── Business Name Match Tests ────────────────────────────────────────────────

test('scoreBusinessMatch finds exact matches', () => {
  const match = scoreBusinessMatch('Acme LLC', 'Acme LLC')
  assert.notEqual(match, null)
  assert.equal(match!.score, 85)
  assert.equal(match!.field, 'business_name')
  
  // Case insensitive
  const matchUpper = scoreBusinessMatch('ACME LLC', 'Acme LLC')
  assert.notEqual(matchUpper, null)
  assert.equal(matchUpper!.score, 85)
})

test('scoreBusinessMatch finds prefix matches', () => {
  const match = scoreBusinessMatch('Acm', 'Acme LLC')
  assert.notEqual(match, null)
  assert.equal(match!.score, 60)
  
  const matchLower = scoreBusinessMatch('acm', 'Acme LLC')
  assert.notEqual(matchLower, null)
  assert.equal(matchLower!.score, 60)
})

test('scoreBusinessMatch finds contains matches', () => {
  const match = scoreBusinessMatch('LLC', 'Acme LLC')
  assert.notEqual(match, null)
  assert.equal(match!.score, 40)
})

test('scoreBusinessMatch requires minimum lengths', () => {
  const shortPrefix = scoreBusinessMatch('A', 'Acme LLC')
  assert.equal(shortPrefix, null)
  
  const shortContains = scoreBusinessMatch('cm', 'Acme LLC')
  assert.equal(shortContains, null)
})

// ─── Fuzzy Match Tests ────────────────────────────────────────────────────────

test('scoreFuzzyMatch finds close spellings', () => {
  const match = scoreFuzzyMatch('Jon', 'John', 'Smith', null)
  assert.notEqual(match, null)
  assert.equal(match!.field, 'fuzzy')
  assert.ok(match!.score > 0)
  assert.ok(match!.score <= 30) // Capped at 30
})

test('scoreFuzzyMatch handles typos', () => {
  // 1 character difference in a 4-letter name
  const match = scoreFuzzyMatch('Johm', 'John', 'Smith', null)
  assert.notEqual(match, null)
  
  // 2 character difference - might not match
  const noMatch = scoreFuzzyMatch('Jxhn', 'John', 'Smith', null)
  assert.equal(noMatch, null)
})

test('scoreFuzzyMatch is case insensitive', () => {
  const match = scoreFuzzyMatch('JOHN', 'John', 'Smith', null)
  assert.notEqual(match, null)
})

test('scoreFuzzyMatch requires minimum 3 characters', () => {
  const match = scoreFuzzyMatch('Jo', 'John', 'Smith', null)
  assert.equal(match, null)
})

test('scoreFuzzyMatch checks all name fields', () => {
  // Match last name
  const lastNameMatch = scoreFuzzyMatch('Smtih', 'John', 'Smith', null)
  assert.notEqual(lastNameMatch, null)
  assert.equal(lastNameMatch!.field, 'fuzzy')
  
  // Match business name
  const businessMatch = scoreFuzzyMatch('Acm', null, null, 'Acme LLC')
  assert.notEqual(businessMatch, null)
})

// ─── Ranking Tests ───────────────────────────────────────────────────────────

test('rankSearchResults prioritizes exact email matches', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: 'different@example.com', phone: null, business_name: null },
    { id: '2', first_name: 'John', last_name: 'Smith', email: 'john@company.com', phone: null, business_name: null },
    { id: '3', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, 'john@company.com')
  assert.equal(results[0].lead.id, '2')
})

test('rankSearchResults prioritizes exact phone matches', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: null, phone: '5551112222', business_name: null },
    { id: '2', first_name: 'John', last_name: 'Smith', email: null, phone: '5551234567', business_name: null },
    { id: '3', first_name: 'John', last_name: 'Smith', email: null, phone: '5559998888', business_name: null },
  ]
  
  const results = rankSearchResults(leads, '5551234567')
  assert.equal(results[0].lead.id, '2')
})

test('rankSearchResults prioritizes exact full name over partial', () => {
  const leads = [
    { id: '1', first_name: 'Johnny', last_name: 'Smith', email: null, phone: null, business_name: null },
    { id: '2', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: null },
    { id: '3', first_name: 'John', last_name: 'Smithson', email: null, phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, 'John Smith')
  assert.equal(results[0].lead.id, '2')
  assert.equal(results[0].primaryMatch, 'full_name')
})

test('rankSearchResults includes match metadata', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: 'john@example.com', phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, 'john@example.com')
  assert.equal(results[0].primaryMatch, 'email')
  assert.equal(results[0].score, 100)
  assert.ok(results[0].matches.length > 0)
})

test('rankSearchResults respects limit', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'A', email: null, phone: null, business_name: null },
    { id: '2', first_name: 'John', last_name: 'B', email: null, phone: null, business_name: null },
    { id: '3', first_name: 'John', last_name: 'C', email: null, phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, 'John', { limit: 2 })
  assert.equal(results.length, 2)
})

test('rankSearchResults handles empty query', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, '')
  assert.equal(results.length, 0)
})

test('rankSearchResults handles no matches', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, 'xyz123')
  assert.equal(results.length, 0)
})

// ─── Integration Tests ────────────────────────────────────────────────────────

test('full search flow: phone with formatting', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: null, phone: '+15551234567', business_name: null },
    { id: '2', first_name: 'Jane', last_name: 'Doe', email: null, phone: '5551234567', business_name: null },
  ]
  
  const results = rankSearchResults(leads, '(555) 123-4567')
  assert.ok(results.length >= 1)
  // Both should match since normalized digits are the same
  assert.ok(results.some(r => r.lead.id === '1'))
  assert.ok(results.some(r => r.lead.id === '2'))
})

test('full search flow: fuzzy business name', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: 'Acme Corporation' },
    { id: '2', first_name: 'Jane', last_name: 'Doe', email: null, phone: null, business_name: 'Widget Inc' },
  ]
  
  const results = rankSearchResults(leads, 'Acme Corporatoin') // Typo
  assert.ok(results.length >= 1)
  assert.equal(results[0].lead.id, '1')
})

test('full search flow: partial email', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Smith', email: 'john.doe@company.com', phone: null, business_name: null },
    { id: '2', first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com', phone: null, business_name: null },
  ]
  
  const results = rankSearchResults(leads, '@company.com')
  assert.ok(results.length >= 1)
  assert.equal(results[0].lead.id, '1')
})

test('full search flow: name with middle name', () => {
  const leads = [
    { id: '1', first_name: 'John', last_name: 'Michael Smith', email: null, phone: null, business_name: null },
    { id: '2', first_name: 'John', last_name: 'Smith', email: null, phone: null, business_name: null },
  ]
  
  // Searching for first + last should find both
  const results = rankSearchResults(leads, 'John Smith')
  assert.ok(results.length >= 1)
  // Exact full name should rank higher
  const exactMatch = results.find(r => r.lead.id === '2')
  const partialMatch = results.find(r => r.lead.id === '1')
  if (exactMatch && partialMatch) {
    assert.ok(exactMatch.score >= partialMatch.score)
  }
})
