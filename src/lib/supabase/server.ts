import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore errors in Server Components
          }
        },
      },
    }
  )
}

/**
 * Service-role client — bypasses RLS entirely.
 * Use only in trusted server-side admin routes (never expose to the browser).
 * Uses the base supabase-js client (not the SSR wrapper) so cookie-based
 * user sessions cannot override the service role key.
 */
export async function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required to create a Supabase client.')
  }

  const key = serviceRoleKey || anonKey
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required to create a Supabase client.')
  }

  if (!serviceRoleKey) {
    console.warn('[supabase] Falling back to anon key for server client because SUPABASE_SERVICE_ROLE_KEY is missing.')
  }

  return createSupabaseClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
