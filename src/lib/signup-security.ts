import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'yopmail.com',
  'sharklasers.com',
  'grr.la',
  'dispostable.com',
  'getnada.com',
  'maildrop.cc',
  'fakeinbox.com',
  'trashmail.com',
  'throwawaymail.com',
  'tempail.com',
  'moakt.com',
  'emailondeck.com',
])

const NAME_ALLOWED = /^[a-zA-Z0-9 .,&'()-]{2,120}$/
const EMAIL_ALLOWED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_SIGNUPS_PER_IP_PER_HOUR = 6
const MAX_SIGNUPS_PER_EMAIL_PER_HOUR = 3

export type SignupSecurityEventType =
  | 'attempt'
  | 'blocked_rate_limit'
  | 'blocked_validation'
  | 'blocked_disposable'
  | 'blocked_captcha'
  | 'created'
  | 'suspicious_created'
  | 'confirmed'

export interface SignupRequestMeta {
  ipAddress: string | null
  userAgent: string | null
  origin: string | null
  referer: string | null
}

export interface SignupAssessment {
  normalizedEmail: string
  normalizedFullName: string
  normalizedBusinessName: string
  riskScore: number
  reasons: string[]
  isDisposableDomain: boolean
  isBlocked: boolean
  blockReason: string | null
  shouldQuarantine: boolean
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeSignupEmail(email: string) {
  return normalizeWhitespace(email).toLowerCase()
}

export function normalizeSignupName(value: string) {
  return normalizeWhitespace(value)
}

function isLikelyRandomToken(value: string) {
  const compact = value.replace(/[^a-zA-Z]/g, '')
  if (compact.length < 10) return false
  if (!/[aeiou]/i.test(compact)) return true
  if (/^[A-Z][a-zA-Z]{10,}$/.test(compact) && !/\s/.test(value)) return true
  if (/[a-z][A-Z][a-z][A-Z]/.test(value)) return true
  return false
}

function looksLikeFragmentedAlias(localPart: string) {
  const dots = localPart.split('.')
  if (dots.length < 4) return false
  const shortSegments = dots.filter((segment) => segment.length <= 2)
  return shortSegments.length >= Math.ceil(dots.length * 0.7)
}

function getDomain(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export function getSignupRequestMeta(req: NextRequest): SignupRequestMeta {
  return {
    ipAddress:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null,
    userAgent: req.headers.get('user-agent'),
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
  }
}

export function assessSignup({
  email,
  fullName,
  businessName,
}: {
  email: string
  fullName: string
  businessName: string
}): SignupAssessment {
  const normalizedEmail = normalizeSignupEmail(email)
  const normalizedFullName = normalizeSignupName(fullName)
  const normalizedBusinessName = normalizeSignupName(businessName)
  const domain = getDomain(normalizedEmail)
  const localPart = normalizedEmail.split('@')[0] ?? ''

  const reasons: string[] = []
  let riskScore = 0

  if (!EMAIL_ALLOWED.test(normalizedEmail)) {
    return {
      normalizedEmail,
      normalizedFullName,
      normalizedBusinessName,
      riskScore: 100,
      reasons: ['invalid_email_format'],
      isDisposableDomain: false,
      isBlocked: true,
      blockReason: 'invalid_email_format',
      shouldQuarantine: false,
    }
  }

  if (!NAME_ALLOWED.test(normalizedFullName)) {
    reasons.push('invalid_full_name_format')
    riskScore += 60
  }

  if (!NAME_ALLOWED.test(normalizedBusinessName)) {
    reasons.push('invalid_business_name_format')
    riskScore += 60
  }

  if (isLikelyRandomToken(normalizedFullName)) {
    reasons.push('randomized_full_name')
    riskScore += 45
  }

  if (isLikelyRandomToken(normalizedBusinessName)) {
    reasons.push('randomized_business_name')
    riskScore += 45
  }

  if (looksLikeFragmentedAlias(localPart)) {
    reasons.push('fragmented_email_alias')
    riskScore += 30
  }

  const isDisposableDomain = DISPOSABLE_DOMAINS.has(domain)
  if (isDisposableDomain) {
    reasons.push('disposable_email_domain')
    riskScore += 100
  }

  const isBlocked =
    isDisposableDomain ||
    reasons.includes('invalid_full_name_format') ||
    reasons.includes('invalid_business_name_format')

  const shouldQuarantine = !isBlocked && riskScore >= 50

  return {
    normalizedEmail,
    normalizedFullName,
    normalizedBusinessName,
    riskScore,
    reasons,
    isDisposableDomain,
    isBlocked,
    blockReason: isDisposableDomain
      ? 'disposable_email_domain'
      : reasons.includes('invalid_full_name_format')
      ? 'invalid_full_name_format'
      : reasons.includes('invalid_business_name_format')
      ? 'invalid_business_name_format'
      : null,
    shouldQuarantine,
  }
}

export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.error('[signup-security] TURNSTILE_SECRET_KEY is missing; rejecting protected submission')
    return false
  }
  if (!token) return false

  try {
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) return false
    const result = await response.json() as { success?: boolean }
    return result.success === true
  } catch (error) {
    console.error('[signup-security] turnstile verification failed', error)
    return false
  }
}

export async function enforceSignupRateLimit({
  email,
  ipAddress,
}: {
  email: string
  ipAddress: string | null
}) {
  const supabase = await createServiceClient()
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const [ipCountRes, emailCountRes] = await Promise.all([
    ipAddress
      ? supabase
          .from('signup_security_events')
          .select('id', { count: 'exact', head: true })
          .eq('ip_address', ipAddress)
          .gte('created_at', windowStart)
      : Promise.resolve({ count: 0 }),
    supabase
      .from('signup_security_events')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', windowStart),
  ])

  const ipCount = 'count' in ipCountRes ? ipCountRes.count ?? 0 : 0
  const emailCount = emailCountRes.count ?? 0
  const blocked = ipCount >= MAX_SIGNUPS_PER_IP_PER_HOUR || emailCount >= MAX_SIGNUPS_PER_EMAIL_PER_HOUR

  return {
    blocked,
    ipCount,
    emailCount,
  }
}

export async function logSignupSecurityEvent({
  email,
  eventType,
  meta,
  riskScore,
  reasons,
  metadata,
}: {
  email: string
  eventType: SignupSecurityEventType
  meta: SignupRequestMeta
  riskScore?: number | null
  reasons?: string[]
  metadata?: Record<string, unknown>
}) {
  try {
    const supabase = await createServiceClient()
    await supabase.from('signup_security_events').insert({
      email,
      ip_address: meta.ipAddress,
      user_agent: meta.userAgent,
      event_type: eventType,
      risk_score: riskScore ?? null,
      risk_reasons: reasons ?? [],
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[signup-security] failed to log security event', error)
  }
}

export function buildSignupSource(meta: SignupRequestMeta) {
  let refererHost: string | null = null
  if (meta.referer) {
    try {
      refererHost = new URL(meta.referer).hostname
    } catch {
      refererHost = null
    }
  }
  return refererHost || meta.origin || 'direct'
}

export function hashForLog(value: string | null) {
  if (!value) return null
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
