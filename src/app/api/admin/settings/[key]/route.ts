import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function assertAdmin() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) return null
  return { supabase }
}

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin.supabase
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', params.key)
    .single()

  if (error || !data) {
    return NextResponse.json({ value: null }, { status: 200 })
  }

  return NextResponse.json({ value: data.value, updated_at: data.updated_at })
}

export async function PUT(req: NextRequest, { params }: { params: { key: string } }) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { value } = await req.json()
  if (typeof value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 })
  }

  const { error } = await admin.supabase
    .from('app_settings')
    .upsert({ key: params.key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, value })
}
