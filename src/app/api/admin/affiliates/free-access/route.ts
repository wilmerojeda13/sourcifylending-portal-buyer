import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runFreeAccessQualificationCheck } from '@/lib/affiliates'

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!data?.is_admin) return null
  return { user, supabase }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (body.run_check) {
    const result = await runFreeAccessQualificationCheck()
    return NextResponse.json({ ok: true, ...result })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
