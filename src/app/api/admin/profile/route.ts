import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/modules/voice-agent/utils/phone'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_admin, full_name, email, phone')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    profile,
  }
}

export async function GET() {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    profile: {
      full_name: admin.profile.full_name ?? '',
      email: admin.profile.email ?? '',
      phone: admin.profile.phone ?? '',
    },
  })
}

export async function PATCH(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    full_name?: string
    phone?: string
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : admin.profile.full_name
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : admin.profile.phone

  if (!fullName) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  }

  let normalizedPhone: string | null = null
  if (rawPhone) {
    const parsed = normalizePhone(rawPhone)
    if (!parsed.valid || !parsed.e164) {
      return NextResponse.json({ error: 'Enter a valid U.S. phone number in a real callable format.' }, { status: 400 })
    }
    normalizedPhone = parsed.e164
  }

  const { error } = await admin.supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', admin.userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    profile: {
      full_name: fullName,
      email: admin.profile.email ?? '',
      phone: normalizedPhone ?? '',
    },
  })
}
