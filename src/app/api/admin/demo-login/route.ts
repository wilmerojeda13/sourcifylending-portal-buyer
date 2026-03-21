import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DEMO_EMAILS = [
  'demo-a@sourcifylending.com',
  'demo-b@sourcifylending.com',
  'demo-c@sourcifylending.com',
  'demo@sourcifylending.com',
]

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { email } = await req.json() as { email: string }
    if (!DEMO_EMAILS.includes(email)) {
      return NextResponse.json({ error: 'Not a demo account' }, { status: 400 })
    }

    // Use request origin so the redirect works from any environment
    // (local dev on any port, staging, production) without needing to
    // change env vars.
    const origin = req.headers.get('origin')
      || req.headers.get('referer')?.replace(/\/$/, '').split('/').slice(0, 3).join('/')
      || process.env.NEXT_PUBLIC_APP_URL
      || 'http://localhost:3001'

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${origin}/auth/callback?next=/dashboard`,
      },
    })

    if (error) throw error

    return NextResponse.json({ url: data.properties.action_link })
  } catch (error) {
    console.error('Demo login error:', error)
    return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 })
  }
}
