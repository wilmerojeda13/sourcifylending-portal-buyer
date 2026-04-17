import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runOnboardingAgent } from '@/modules/agents/onboarding-agent'
import { runDocumentAgent } from '@/modules/agents/document-agent'
import { runRoadmapAgent } from '@/modules/agents/roadmap-agent'

// ─── Trigger an agent run ─────────────────────────────────────────────────────
// POST /api/agents/run
// Body: { agent: 'onboarding' | 'document' | 'roadmap', documentId?: string }
// Can be called by: internal triggers, document upload hooks, task completion

export async function POST(req: Request) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, member_status, is_demo, assigned_program')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { agent, userId: targetUserId, documentId } = body

    // Admins can run agents for any user. Clients can only run for themselves.
    const runForUserId = profile.is_admin && targetUserId ? targetUserId : user.id

    let result = { actionsCount: 0 }

    switch (agent) {
      case 'onboarding':
        result = await runOnboardingAgent(runForUserId)
        break
      case 'document':
        if (!documentId) return NextResponse.json({ error: 'documentId required for document agent' }, { status: 400 })
        result = await runDocumentAgent(runForUserId, documentId)
        break
      case 'roadmap':
        result = await runRoadmapAgent(runForUserId)
        break
      default:
        return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, agent, ...result })
  } catch (err) {
    console.error('[AgentRun]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
