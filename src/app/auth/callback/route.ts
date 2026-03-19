import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Ensure a profile row exists for OAuth users (Google sign-in creates no profile automatically)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (!existing) {
          const fullName = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split('@')[0]
            || ''

          await supabase.from('profiles').insert({
            id: user.id,
            email: user.email ?? '',
            full_name: fullName,
            subscription_status: 'inactive',
            account_state: 'active_member',
            progress_percentage: 0,
            nsf_flag: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          // Log signup event (fire-and-forget)
          supabase.from('activity_logs').insert({
            user_id: user.id,
            event_type: 'signup',
            event_data: { email: user.email, source: 'google_oauth' },
            created_at: new Date().toISOString(),
          }).then(() => {})
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If something went wrong, send to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
