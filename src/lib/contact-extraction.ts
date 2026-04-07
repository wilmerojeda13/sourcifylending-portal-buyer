// Contact information extraction utilities for calendar sync

export function extractEmailFromText(text: string): string | null {
  // Common email patterns
  const emailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /(?:email|e-mail|mail)[:\s]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/gi,
    /(?:contact|reach)[:\s]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/gi,
  ]
  
  for (const pattern of emailPatterns) {
    const matches = text.match(pattern)
    if (matches && matches.length > 0) {
      // Return the first valid email that's not a generic/no-reply
      for (const email of matches) {
        const cleanEmail = email.toLowerCase().trim()
        if (!cleanEmail.includes('no-reply') && 
            !cleanEmail.includes('noreply') && 
            !cleanEmail.includes('do-not-reply') &&
            !cleanEmail.includes('sourcifylending.com')) {
          return cleanEmail
        }
      }
    }
  }
  
  return null
}

export function extractPhoneFromText(text: string): string | null {
  // Remove common formatting characters and normalize
  const cleanText = text.replace(/[^\d+\-\s\(\)]/g, ' ')
  
  // Phone number patterns (US and international)
  const phonePatterns = [
    // Standard US format with area code
    /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
    // US format with parentheses
    /\b\(\d{3}\)[-\s]?\d{3}[-.\s]?\d{4}\b/g,
    // International format
    /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
    // 10-digit without separators
    /\b\d{10}\b/g,
    // Labeled phone numbers
    /(?:phone|tel|telephone|mobile|cell)[:\s]+([+\d\s\-\(\)]{10,})/gi,
  ]
  
  for (const pattern of phonePatterns) {
    const matches = cleanText.match(pattern)
    if (matches && matches.length > 0) {
      // Return the first valid phone number
      const phone = matches[0].replace(/[^\d+]/g, '')
      if (phone.length >= 10) {
        return phone
      }
    }
  }
  
  return null
}

export function extractBusinessNameFromText(text: string): string | null {
  // Common business name patterns
  const businessPatterns = [
    // LLC patterns
    /\b([A-Za-z0-9\s&]+(?:LLC|L\.L\.C\.|Limited Liability Company))\b/gi,
    // Corporation patterns
    /\b([A-Za-z0-9\s&]+(?:Corp|Corporation|Inc|Incorporated))\b/gi,
    // Ltd patterns
    /\b([A-Za-z0-9\s&]+(?:Ltd|Limited|L\.L\.T\.D\.))\b/gi,
    // DBA patterns
    /\b(?:DBA|d\.b\.a\.|doing business as)[:\s]+([A-Za-z0-9\s&]+)\b/gi,
    // "Company" or "Construction" etc.
    /\b([A-Za-z0-9\s&]+(?:Company|Construction|Contracting|Services|Solutions|Group|Enterprises|Associates|Partners))\b/gi,
  ]
  
  for (const pattern of businessPatterns) {
    const matches = text.match(pattern)
    if (matches && matches.length > 0) {
      // Return the first valid business name, clean it up
      let businessName = matches[1] || matches[0]
      businessName = businessName.trim()
      
      // Skip if it's too short or looks like a generic term
      if (businessName.length < 3 || 
          ['Company', 'Services', 'Solutions', 'Group'].includes(businessName)) {
        continue
      }
      
      return businessName
    }
  }
  
  return null
}

export function extractNameFromText(text: string): { firstName: string; lastName: string } | null {
  // Common name patterns
  const namePatterns = [
    // "with John Doe"
    /(?:with|for)[:\s]+([A-Za-z]+\s+[A-Za-z]+)/gi,
    // "Contact: Jane Smith"
    /(?:contact|name|client|customer)[:\s]+([A-Za-z]+\s+[A-Za-z]+)/gi,
    // Just two capitalized words together
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g,
  ]
  
  for (const pattern of namePatterns) {
    const matches = text.match(pattern)
    if (matches && matches.length > 0) {
      const fullName = matches[1] || matches[0]
      const parts = fullName.trim().split(/\s+/).filter(Boolean)
      
      if (parts.length >= 2) {
        // Skip common business words that might be mistaken for names
        const businessWords = ['Construction', 'Company', 'Services', 'Solutions', 'Group', 'LLC', 'Inc', 'Corp', 'Ltd']
        if (!businessWords.some(word => parts[0].includes(word) || parts[1].includes(word))) {
          return {
            firstName: parts[0],
            lastName: parts.slice(1).join(' ')
          }
        }
      }
    }
  }
  
  return null
}
