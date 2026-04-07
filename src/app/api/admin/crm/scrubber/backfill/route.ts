import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runHistoricalBackfill } from '@/scripts/crm-scrubber-backfill'

async function assertAdmin() {
  // For this endpoint, we'll use a service client since it's a system operation
  // In production, you might want to add additional authentication
  const supabase = await createServiceClient()
  return supabase
}

// POST /api/admin/crm/scrubber/backfill
export async function POST(req: NextRequest) {
  const supabase = await assertAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { confirm = false } = body

    if (!confirm) {
      return NextResponse.json({
        error: 'Confirmation required',
        message: 'This will process all existing leads and apply smart status classification. This is a resource-intensive operation that should only be run once.',
        required: { confirm: true }
      }, { status: 400 })
    }

    console.log('[CRM Scrubber] Starting historical backfill via API')

    const results = await runHistoricalBackfill()

    return NextResponse.json({
      success: true,
      message: 'Historical backfill completed successfully',
      results
    })

  } catch (error) {
    console.error('[CRM Scrubber] Historical backfill API failed:', error)
    return NextResponse.json({ 
      error: 'Historical backfill failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
