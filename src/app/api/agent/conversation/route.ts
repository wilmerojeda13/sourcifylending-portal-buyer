import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateActiveConversation } from '@/lib/ai-memory'
import { getBusinessContext } from '@/lib/business-context'

// GET — load or create active conversation + its messages
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: conversationId, isNew, wasRolledOver } = await getOrCreateActiveConversation(context.activeBusinessId)

    // Load prior messages for this conversation
    const { data: messages } = await supabase
      .from('ai_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', context.activeBusinessId)
      .order('created_at', { ascending: true })
      .limit(100)

    // If rolled over, load the prior conversation summary for context banner
    let priorSummary: string | null = null
    if (wasRolledOver) {
      const { data: memProfile } = await supabase
        .from('ai_memory_profiles')
        .select('last_summary')
        .eq('user_id', context.activeBusinessId)
        .maybeSingle()
      priorSummary = memProfile?.last_summary ?? null
    }

    return NextResponse.json({
      conversation_id: conversationId,
      is_new: isNew,
      was_rolled_over: wasRolledOver,
      prior_summary: priorSummary,
      messages: messages ?? [],
    })
  } catch (err) {
    // Tables may not exist yet — return empty session so chat still works
    console.error('[Conversation] Failed to load conversation (tables may not exist):', err)
    return NextResponse.json({
      conversation_id: null,
      is_new: true,
      was_rolled_over: false,
      prior_summary: null,
      messages: [],
    })
  }
}

// POST — save a message to the active conversation
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id, role, content } = await req.json()
  if (!conversation_id || !role || !content) {
    return NextResponse.json({ error: 'conversation_id, role, and content required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Rough token estimate: ~1 token per 4 chars
  const tokenEstimate = Math.ceil(content.length / 4)

  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id,
      user_id: context.activeBusinessId,
      role,
      content,
      token_estimate: tokenEstimate,
      created_at: now,
    })
    .select('id')
    .single()

  if (error) {
    // Silently fail if tables don't exist — don't break the chat
    console.error('[Conversation] Failed to save message:', error.message)
    return NextResponse.json({ message_id: null })
  }

  // Update conversation token estimate
  await supabase.rpc('increment_conversation_tokens', {
    conv_id: conversation_id,
    add_tokens: tokenEstimate,
  }).catch(() => {
    // RPC may not exist yet — best effort, fall back to direct update
    supabase
      .from('ai_conversations')
      .select('token_estimate')
      .eq('id', conversation_id)
      .single()
      .then(({ data: conv }) => {
        if (conv) {
          supabase
            .from('ai_conversations')
            .update({ token_estimate: (conv.token_estimate ?? 0) + tokenEstimate })
            .eq('id', conversation_id)
        }
      })
  })

  return NextResponse.json({ message_id: data.id })
}
