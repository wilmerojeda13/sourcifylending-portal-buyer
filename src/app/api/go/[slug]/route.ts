import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRACKED_LINK_MAP } from '@/lib/tracked-links'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const destination = TRACKED_LINK_MAP[slug]

  if (!destination) {
    // Unknown slug — redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Log the click fire-and-forget (never block the redirect)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const source = req.nextUrl.searchParams.get('source') ?? 'ai_chat'

    if (user) {
      // Fire and forget — don't await
      supabase.from('activity_logs').insert({
        user_id: user.id,
        event_type: 'tracked_link_click',
        event_data: {
          slug,
          destination,
          source,
          url: req.url,
        },
        created_at: new Date().toISOString(),
      }).then(() => {})
    }
  } catch {
    // Never block the redirect due to tracking errors
  }

  return NextResponse.redirect(destination)
}
