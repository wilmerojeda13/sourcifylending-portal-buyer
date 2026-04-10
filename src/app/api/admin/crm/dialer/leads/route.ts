import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getLeadCompliance } from '@/lib/crm-call-compliance'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

// GET /api/admin/crm/dialer/leads
// Returns raw leads for the dialer (not yet promoted to CRM)
export async function GET(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') ?? '0')
  const limit = parseInt(searchParams.get('limit') ?? '100')

  let query = supabase
    .from('dialer_raw_leads')
    .select('*', { count: 'exact' })
    .is('promoted_to_crm_lead_id', null)
    .eq('do_not_call', false)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  query = query.range(page * limit, (page + 1) * limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with compliance data
  const enrichedLeads = await Promise.all(
    (data ?? []).map(async (lead) => {
      const compliance = await getLeadCompliance(lead)
      return {
        ...lead,
        ...compliance,
      }
    })
  )

  return NextResponse.json({
    leads: enrichedLeads,
    total: count ?? 0,
    page,
    limit,
  })
}
