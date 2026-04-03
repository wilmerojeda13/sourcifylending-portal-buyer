import { NextRequest, NextResponse } from 'next/server'
import { getBusinessContext } from '@/lib/business-context'
import {
  getDefaultCategories,
  normalizePreferenceRecord,
  type NotificationScope,
} from '@/lib/notification-preferences'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function parseScope(input: string | null): NotificationScope | null {
  return input === 'member' || input === 'admin' ? input : null
}

async function getRequestContext(scope: NotificationScope) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (scope === 'admin') {
    if (!profile?.is_admin) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return {
      authUserId: user.id,
      businessProfileId: null as string | null,
      supabase,
    }
  }

  const businessContext = await getBusinessContext()
  if (!businessContext) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return {
    authUserId: user.id,
    businessProfileId: businessContext.activeBusinessId,
    supabase,
  }
}

async function loadPreferenceRecord(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  authUserId: string,
  businessProfileId: string | null,
  scope: NotificationScope,
) {
  let query = supabase
    .from('notification_preferences')
    .select('desktop_enabled, prompt_dismissed_at, permission_state, categories')
    .eq('auth_user_id', authUserId)
    .eq('scope', scope)

  query = businessProfileId
    ? query.eq('business_profile_id', businessProfileId)
    : query.is('business_profile_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return normalizePreferenceRecord(scope, data)
}

export async function GET(req: NextRequest) {
  const scope = parseScope(req.nextUrl.searchParams.get('scope'))
  if (!scope) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }

  const context = await getRequestContext(scope)
  if ('error' in context) return context.error

  const record = await loadPreferenceRecord(
    context.supabase,
    context.authUserId,
    context.businessProfileId,
    scope,
  )

  return NextResponse.json({ scope, preferences: record })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const scope = parseScope(typeof body?.scope === 'string' ? body.scope : null)
  if (!scope) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }

  const context = await getRequestContext(scope)
  if ('error' in context) return context.error

  const current = await loadPreferenceRecord(
    context.supabase,
    context.authUserId,
    context.businessProfileId,
    scope,
  )

  const merged = normalizePreferenceRecord(scope, {
    desktop_enabled: typeof body?.desktop_enabled === 'boolean' ? body.desktop_enabled : current.desktop_enabled,
    prompt_dismissed_at: body?.prompt_dismissed_at === null || typeof body?.prompt_dismissed_at === 'string'
      ? body.prompt_dismissed_at
      : current.prompt_dismissed_at,
    permission_state:
      body?.permission_state === 'granted' ||
      body?.permission_state === 'denied' ||
      body?.permission_state === 'default'
        ? body.permission_state
        : current.permission_state,
    categories:
      body?.categories && typeof body.categories === 'object'
        ? { ...current.categories, ...body.categories }
        : current.categories,
  })

  let existingQuery = context.supabase
    .from('notification_preferences')
    .select('id')
    .eq('auth_user_id', context.authUserId)
    .eq('scope', scope)

  existingQuery = context.businessProfileId
    ? existingQuery.eq('business_profile_id', context.businessProfileId)
    : existingQuery.is('business_profile_id', null)

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const payload = {
    auth_user_id: context.authUserId,
    business_profile_id: context.businessProfileId,
    scope,
    desktop_enabled: merged.desktop_enabled,
    prompt_dismissed_at: merged.prompt_dismissed_at,
    permission_state: merged.permission_state,
    categories: merged.categories ?? getDefaultCategories(scope),
    updated_at: new Date().toISOString(),
  }

  const mutation = existing?.id
    ? context.supabase
        .from('notification_preferences')
        .update(payload)
        .eq('id', existing.id)
    : context.supabase
        .from('notification_preferences')
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })

  const { error } = await mutation

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ scope, preferences: merged })
}
