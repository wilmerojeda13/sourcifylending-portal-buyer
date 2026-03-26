import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify affiliate
  const { data: affiliate } = await authClient
    .from('affiliates')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!affiliate || affiliate.status === 'suspended') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const supabase = await createServiceClient()
  const { data: videos, error } = await supabase
    .from('affiliate_training_videos')
    .select('*')
    .eq('is_published', true)
    .order('category')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ videos: videos ?? [] })
}
