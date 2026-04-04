import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

function getAccountPageUrl(request: Request) {
  return `${getAppBaseUrl(request)}/affiliate/account`
}

function withConnectParams(base: string, params: Record<string, string>) {
  const url = new URL(base)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

function safePartnerError(message: string) {
  if (message.toLowerCase().includes('email')) {
    return 'Your partner account is missing an email address. Please contact support before connecting Stripe.'
  }
  if (message.toLowerCase().includes('api key') || message.toLowerCase().includes('authentication')) {
    return 'Stripe onboarding is temporarily unavailable. Please try again shortly.'
  }
  return 'Unable to start Stripe onboarding right now. Please try again.'
}

function getAppBaseUrl(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL

  if (configured) {
    return configured.startsWith('http') ? configured : `https://${configured}`
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return new URL(request.url).origin
}

async function createOnboardingLink(request: Request) {
  const accountPageUrl = getAccountPageUrl(request)

  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return {
        ok: false as const,
        status: 401,
        error: 'Please sign in to your partner account first.',
        redirectUrl: withConnectParams(accountPageUrl, { connect: 'error', reason: 'auth' }),
      }
    }

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, name, email, stripe_account_id, stripe_connect_status, status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!affiliate || affiliate.status === 'suspended') {
      return {
        ok: false as const,
        status: 404,
        error: 'Partner account not found.',
        redirectUrl: withConnectParams(accountPageUrl, { connect: 'error', reason: 'missing_partner' }),
      }
    }

    if (!affiliate.email) {
      return {
        ok: false as const,
        status: 400,
        error: 'Your partner account is missing an email address. Please contact support before connecting Stripe.',
        redirectUrl: withConnectParams(accountPageUrl, { connect: 'error', reason: 'missing_email' }),
      }
    }

    const baseUrl = getAppBaseUrl(request)
    let stripeAccountId = affiliate.stripe_account_id

    // Create a new Express account if not yet connected
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: affiliate.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { affiliate_id: affiliate.id },
      })
      stripeAccountId = account.id

      await supabase.from('affiliates').update({
        stripe_account_id: stripeAccountId,
        stripe_connect_status: 'pending',
        updated_at: new Date().toISOString(),
      }).eq('id', affiliate.id)
    }

    // Generate fresh onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/affiliate/account?connect=refresh`,
      return_url: `${baseUrl}/affiliate/account?connect=success`,
      type: 'account_onboarding',
    })

    return { ok: true as const, url: accountLink.url }
  } catch (error) {
    console.error('affiliate_stripe_connect_onboard_failed', error)

    const message =
      error instanceof Stripe.errors.StripeError
        ? safePartnerError(error.message)
        : error instanceof Error
          ? safePartnerError(error.message)
          : 'Unable to start Stripe onboarding right now. Please try again.'

    return {
      ok: false as const,
      status: 500,
      error: message,
      redirectUrl: withConnectParams(accountPageUrl, { connect: 'error', reason: 'stripe' }),
    }
  }
}

export async function GET(request: Request) {
  const result = await createOnboardingLink(request)

  if (result.ok) {
    return NextResponse.redirect(result.url, { status: 303 })
  }

  return NextResponse.redirect(result.redirectUrl, { status: 303 })
}

export async function POST(request: Request) {
  const result = await createOnboardingLink(request)

  if (result.ok) {
    return NextResponse.json({ url: result.url })
  }

  return NextResponse.json({ error: result.error }, { status: result.status })
}
