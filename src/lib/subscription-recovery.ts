import type Stripe from 'stripe'

export type RecoverableBillingStatus =
  | 'active'
  | 'trialing'
  | 'inactive'
  | 'past_due'
  | 'past_due_locked'
  | 'suspended'
  | 'canceled'

export const GRACE_BILLING_STATUSES: RecoverableBillingStatus[] = ['past_due']
export const LOCKED_BILLING_STATUSES: RecoverableBillingStatus[] = ['past_due_locked', 'suspended', 'canceled', 'inactive']

export function isGraceBillingStatus(status: string | null | undefined): boolean {
  return status === 'past_due'
}

export function isLockedBillingStatus(status: string | null | undefined): boolean {
  return !!status && LOCKED_BILLING_STATUSES.includes(status as RecoverableBillingStatus)
}

export function isPaidAccessBillingStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const candidate = (invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }).payment_intent
  if (!candidate) return null
  return typeof candidate === 'string' ? candidate : candidate.id
}

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const candidate = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription
  if (!candidate) return null
  return typeof candidate === 'string' ? candidate : candidate.id
}

export function getInvoiceNextPaymentAttemptAt(invoice: Stripe.Invoice): string | null {
  const nextAttempt = (invoice as Stripe.Invoice & { next_payment_attempt?: number | null }).next_payment_attempt
  return nextAttempt ? new Date(nextAttempt * 1000).toISOString() : null
}

export function getInvoiceRetryCount(invoice: Stripe.Invoice): number {
  return Math.max(0, Number((invoice as Stripe.Invoice & { attempt_count?: number | null }).attempt_count ?? 0))
}

export function resolveFailedPaymentStatus(invoice: Stripe.Invoice): 'past_due' | 'past_due_locked' {
  const nextAttemptAt = getInvoiceNextPaymentAttemptAt(invoice)
  if (nextAttemptAt) return 'past_due'

  const billingReason = (invoice as Stripe.Invoice & { billing_reason?: string | null }).billing_reason
  const collectionMethod = (invoice as Stripe.Invoice & { collection_method?: string | null }).collection_method
  const retryCount = getInvoiceRetryCount(invoice)

  if (collectionMethod === 'charge_automatically' && retryCount > 0 && billingReason?.startsWith('subscription')) {
    return 'past_due_locked'
  }

  return 'past_due'
}

export function buildFailedPaymentReason(invoice: Stripe.Invoice): string {
  const paymentIntent = (invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string | null }).payment_intent
  if (paymentIntent && typeof paymentIntent !== 'string') {
    const lastError = paymentIntent.last_payment_error
    const declineCode = lastError?.decline_code
    const code = lastError?.code
    if (declineCode && code) return `${code}: ${declineCode}`
    if (declineCode) return declineCode
    if (code) return code
    if (lastError?.message) return lastError.message
  }

  return invoice.status === 'open'
    ? 'Stripe could not collect the invoice payment.'
    : 'Payment failed.'
}
