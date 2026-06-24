import { resolveFailedPaymentStatus, getInvoiceNextPaymentAttemptAt, getInvoiceRetryCount } from '../subscription-recovery'

describe('subscription-recovery', () => {
  test('keeps failed subscription in past_due when Stripe has another retry scheduled', () => {
    const retryAt = Math.floor(Date.UTC(2026, 6, 1) / 1000)
    const invoice = {
      next_payment_attempt: retryAt,
      attempt_count: 1,
      billing_reason: 'subscription_cycle',
      collection_method: 'charge_automatically',
    } as never

    expect(resolveFailedPaymentStatus(invoice)).toBe('past_due')
    expect(getInvoiceNextPaymentAttemptAt(invoice)).toBe('2026-07-01T00:00:00.000Z')
    expect(getInvoiceRetryCount(invoice)).toBe(1)
  })

  test('locks premium access after Stripe has no further automatic retry scheduled', () => {
    const invoice = {
      next_payment_attempt: null,
      attempt_count: 4,
      billing_reason: 'subscription_cycle',
      collection_method: 'charge_automatically',
    } as never

    expect(resolveFailedPaymentStatus(invoice)).toBe('past_due_locked')
  })
})
