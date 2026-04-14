/**
 * Dialer Lead Validator
 *
 * Validates lead data against quality standards.
 * Does NOT modify leads, only determines validity.
 */

export interface LeadValidationResult {
  isValid: boolean
  rejectionReason?: string
  rejectionDetail?: string
}

/**
 * Normalize phone number to digits only, removing leading 1
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
}

/**
 * Validate a single lead against quality standards
 */
export function validateLead(leadData: {
  first_name?: string
  last_name?: string
  phone?: string
  email?: string
  business_name?: string
  notes?: string
}): LeadValidationResult {
  // Phone validation - most critical
  if (!leadData.phone?.trim()) {
    return {
      isValid: false,
      rejectionReason: 'MISSING_PHONE',
      rejectionDetail: 'Phone number is required',
    }
  }

  const phoneNorm = normalizePhone(leadData.phone.trim())

  // Check for fake phone sequences
  if (/^(1{10}|0{10}|1234567890|9999999999|5555555555)$/.test(phoneNorm)) {
    return {
      isValid: false,
      rejectionReason: 'INVALID_PHONE',
      rejectionDetail: `Phone number appears fake: ${leadData.phone.trim()}`,
    }
  }

  // Check phone length
  if (phoneNorm.length < 10) {
    return {
      isValid: false,
      rejectionReason: 'INVALID_PHONE',
      rejectionDetail: `Phone number too short: ${leadData.phone.trim()} (${phoneNorm.length} digits)`,
    }
  }

  // First name validation
  if (!leadData.first_name?.trim()) {
    return {
      isValid: false,
      rejectionReason: 'MISSING_FIRST_NAME',
      rejectionDetail: 'First name is required',
    }
  }

  const firstName = leadData.first_name.trim()

  // Check for placeholder names
  if (/^(unknown|n\/a|test|temp|invalid|na|pending|other|demo|sample|unnamed|none)$/i.test(firstName)) {
    return {
      isValid: false,
      rejectionReason: 'PLACEHOLDER_NAME',
      rejectionDetail: `First name is placeholder text: "${firstName}"`,
    }
  }

  // Check for garbage/special character only names
  if (/^[!@#$%^&*()_+=\[\]{};:'",./<>?|\\~`\-]{2,}$/.test(firstName)) {
    return {
      isValid: false,
      rejectionReason: 'GARBAGE_NAME',
      rejectionDetail: `First name contains only special characters: "${firstName}"`,
    }
  }

  // Check for single character names
  if (/^.$/.test(firstName)) {
    return {
      isValid: false,
      rejectionReason: 'GARBAGE_NAME',
      rejectionDetail: `First name is only one character: "${firstName}"`,
    }
  }

  // Last name validation (if provided)
  const lastName = leadData.last_name?.trim()
  if (lastName) {
    if (/^(unknown|n\/a|test|temp|invalid|na|pending|other|demo|sample|unnamed|none)$/i.test(lastName)) {
      return {
        isValid: false,
        rejectionReason: 'PLACEHOLDER_NAME',
        rejectionDetail: `Last name is placeholder text: "${lastName}"`,
      }
    }

    if (/^[!@#$%^&*()_+=\[\]{};:'",./<>?|\\~`\-]{2,}$/.test(lastName)) {
      return {
        isValid: false,
        rejectionReason: 'GARBAGE_NAME',
        rejectionDetail: `Last name contains only special characters: "${lastName}"`,
      }
    }
  }

  // Business name validation
  if (!leadData.business_name?.trim()) {
    return {
      isValid: false,
      rejectionReason: 'MISSING_BUSINESS_NAME',
      rejectionDetail: 'Business name is required',
    }
  }

  const businessName = leadData.business_name.trim()

  // Check for garbage business names
  if (/^(asdfgh|qwerty|aaa+|zzz+|\.{2,}|xxx|test business|test|company|business)$/i.test(businessName)) {
    return {
      isValid: false,
      rejectionReason: 'GARBAGE_BUSINESS_NAME',
      rejectionDetail: `Business name appears to be placeholder/garbage: "${businessName}"`,
    }
  }

  // Check for single character business names
  if (/^.$/.test(businessName)) {
    return {
      isValid: false,
      rejectionReason: 'GARBAGE_BUSINESS_NAME',
      rejectionDetail: `Business name is only one character: "${businessName}"`,
    }
  }

  // Check for mostly special characters in business name
  if (/^[!@#$%^&*()_+=\[\]{};:'",./<>?|\\~`\-]{3,}$/.test(businessName)) {
    return {
      isValid: false,
      rejectionReason: 'GARBAGE_BUSINESS_NAME',
      rejectionDetail: `Business name contains only special characters: "${businessName}"`,
    }
  }

  // Email validation (if provided)
  if (leadData.email?.trim()) {
    if (/@(test\.com|example\.com|example\.org|example\.net)$/i.test(leadData.email.trim())) {
      return {
        isValid: false,
        rejectionReason: 'TEST_EMAIL',
        rejectionDetail: `Email uses test domain: ${leadData.email.trim()}`,
      }
    }
  }

  // All checks passed
  return { isValid: true }
}
