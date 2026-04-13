import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isProfessionalEmail, buildLeadName } from './lead-processor'
import type { CrmLead } from './lead-processor'

describe('Lead Processor Agent', () => {
  describe('isProfessionalEmail', () => {
    it('returns false for consumer email domains', () => {
      assert.strictEqual(isProfessionalEmail('user@gmail.com'), false)
      assert.strictEqual(isProfessionalEmail('user@yahoo.com'), false)
      assert.strictEqual(isProfessionalEmail('user@hotmail.com'), false)
      assert.strictEqual(isProfessionalEmail('user@outlook.com'), false)
      assert.strictEqual(isProfessionalEmail('user@icloud.com'), false)
      assert.strictEqual(isProfessionalEmail('user@protonmail.com'), false)
    })

    it('returns true for professional/business domains', () => {
      assert.strictEqual(isProfessionalEmail('ceo@acme-corp.com'), true)
      assert.strictEqual(isProfessionalEmail('contact@sourcifylending.com'), true)
      assert.strictEqual(isProfessionalEmail('john@lawfirm.io'), true)
      assert.strictEqual(isProfessionalEmail('sarah@techstartup.co'), true)
      assert.strictEqual(isProfessionalEmail('info@bankofamerica.com'), true)
    })

    it('handles edge cases', () => {
      assert.strictEqual(isProfessionalEmail(null), false)
      assert.strictEqual(isProfessionalEmail(''), false)
      assert.strictEqual(isProfessionalEmail('invalid-email'), false)
      assert.strictEqual(isProfessionalEmail('@nodomain.com'), false)
    })

    it('handles subdomains correctly', () => {
      // These should be treated as consumer (subdomains of gmail/yahoo)
      assert.strictEqual(isProfessionalEmail('user@mail.gmail.com'), false)
      assert.strictEqual(isProfessionalEmail('user@sub.yahoo.co.uk'), false)
    })
  })

  describe('buildLeadName', () => {
    it('builds full name from first and last', () => {
      const lead = {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: null,
        business_name: null,
      } as CrmLead

      assert.strictEqual(buildLeadName(lead), 'John Doe')
    })

    it('uses business name when no personal name', () => {
      const lead = {
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        business_name: 'Acme Corp',
      } as CrmLead

      assert.strictEqual(buildLeadName(lead), 'Acme Corp')
    })

    it('falls back to "Lead" when no names available', () => {
      const lead = {
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        business_name: null,
      } as CrmLead

      assert.strictEqual(buildLeadName(lead), 'Lead')
    })

    it('handles partial names', () => {
      const leadFirstOnly = {
        id: '1',
        first_name: 'Jane',
        last_name: null,
        email: null,
        business_name: null,
      } as CrmLead

      assert.strictEqual(buildLeadName(leadFirstOnly), 'Jane')
    })
  })
})

console.log('✓ All tests passed')
