import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { ACTIVE_BUSINESS_COOKIE, getBusinessContext } from '@/lib/business-context'

export const dynamic = 'force-dynamic'

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(req: NextRequest) {
  try {
    const context = await getBusinessContext()
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canManageBusinesses = context.businesses.some(
      (business) => business.role === 'owner' || business.role === 'admin',
    )
    if (!canManageBusinesses) {
      return NextResponse.json({ error: 'Business creation is not allowed for this account' }, { status: 403 })
    }

    const body = await req.json()
    const businessName = sanitizeText(body?.business_name)
    const entityType = sanitizeText(body?.entity_type)
    const industry = sanitizeText(body?.industry)

    if (!businessName) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    }

    const duplicate = context.businesses.some(
      (business) => business.label.trim().toLowerCase() === businessName.toLowerCase(),
    )
    if (duplicate) {
      return NextResponse.json({ error: 'A business with this name already exists on this account' }, { status: 409 })
    }

    const supabase = await createServiceClient()
    const now = new Date().toISOString()
    const businessId = crypto.randomUUID()

    const { error: profileError } = await supabase.from('profiles').insert({
      id: businessId,
      full_name: context.viewerProfile.full_name,
      email: context.viewerProfile.email,
      business_name: businessName,
      entity_type: entityType || null,
      industry: industry || null,
      phone: (context.viewerProfile as Record<string, unknown>)?.phone ?? null,
      account_state: 'prospect',
      subscription_status: 'inactive',
      progress_percentage: 0,
      nsf_flag: false,
      assigned_program: null,
      readiness_status: null,
      current_stage: null,
      portal_blocked: false,
      created_at: now,
      updated_at: now,
    })

    if (profileError) {
      throw profileError
    }

    const { error: membershipError } = await supabase.from('profile_business_memberships').insert({
      user_id: context.userId,
      business_profile_id: businessId,
      role: 'owner',
      status: 'active',
      is_default: false,
      created_at: now,
      updated_at: now,
    })

    if (membershipError) {
      throw membershipError
    }

    const { error: viewerUpdateError } = await supabase
      .from('profiles')
      .update({
        active_business_profile_id: businessId,
        updated_at: now,
      })
      .eq('id', context.userId)

    if (viewerUpdateError) {
      throw viewerUpdateError
    }

    const response = NextResponse.json({
      success: true,
      business_id: businessId,
      redirect_to: '/billing?subscription_required=1&new_business=1',
    })
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, businessId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 180,
    })
    return response
  } catch (error) {
    console.error('Portal business create error:', error)
    return NextResponse.json({ error: 'Failed to add business' }, { status: 500 })
  }
}
