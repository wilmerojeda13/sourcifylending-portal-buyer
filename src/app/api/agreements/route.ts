import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { logActivity } from '@/lib/activity'
import type { ProgramId } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { program, agreement_version } = await req.json() as {
      program: ProgramId
      agreement_version: string
    }

    if (!['program_a', 'program_b', 'program_c'].includes(program)) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    }

    const ip = (
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      null
    )
    const userAgent = req.headers.get('user-agent')

    const serviceClient = await createServiceClient()
    const { error } = await serviceClient.from('agreements').insert({
      user_id: context.activeBusinessId,
      program,
      agreement_version: agreement_version ?? 'v1.0',
      accepted_at: new Date().toISOString(),
      ip_address: ip,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Agreement insert error:', error)
      return NextResponse.json({ error: 'Failed to save agreement' }, { status: 500 })
    }

    await logActivity(context.activeBusinessId, 'agreement_accepted', { program, agreement_version, auth_user_id: context.userId }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Agreements route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
