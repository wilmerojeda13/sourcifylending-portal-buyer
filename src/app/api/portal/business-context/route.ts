import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ACTIVE_BUSINESS_COOKIE,
  getBusinessContext,
  isSameBusinessSelection,
} from '@/lib/business-context'
import { isSchemaDriftError } from '@/lib/supabase-schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await getBusinessContext()
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      active_business_id: context.activeBusinessId,
      active_profile: context.activeProfile,
      active_role: context.activeRole,
      businesses: context.businesses,
      has_multiple_businesses: context.hasMultipleBusinesses,
    })
  } catch (error) {
    console.error('Business context GET error:', error)
    return NextResponse.json({ error: 'Failed to load businesses' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestedBusinessId = typeof body?.business_id === 'string' ? body.business_id : ''
    if (!requestedBusinessId) {
      return NextResponse.json({ error: 'Business id required' }, { status: 400 })
    }

    const context = await getBusinessContext(requestedBusinessId)
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isSameBusinessSelection(context, requestedBusinessId)) {
      return NextResponse.json({ error: 'Business access denied' }, { status: 403 })
    }

    const supabase = await createClient()
    const { error: persistError } = await supabase
      .from('profiles')
      .update({
        active_business_profile_id: requestedBusinessId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.userId)

    if (persistError && !isSchemaDriftError(persistError, 'active_business_profile_id')) {
      throw persistError
    }

    const response = NextResponse.json({ success: true, active_business_id: requestedBusinessId })
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, requestedBusinessId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 180,
    })
    return response
  } catch (error) {
    console.error('Business context POST error:', error)
    return NextResponse.json({ error: 'Failed to switch business' }, { status: 500 })
  }
}
