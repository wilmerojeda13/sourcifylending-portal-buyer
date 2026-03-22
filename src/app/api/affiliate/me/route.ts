import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!affiliate) return NextResponse.json({ error: 'Not an affiliate' }, { status: 404 })
    return NextResponse.json({ affiliate })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
