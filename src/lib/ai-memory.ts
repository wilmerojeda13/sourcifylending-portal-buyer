/**
 * AI Memory System utilities
 *
 * Provides helpers for logging account events and updating AI memory profiles.
 * Events are stored in ai_memory_events and are loaded by the AI agent as context.
 */

import { createServiceClient } from '@/lib/supabase/server'

export type AIMemoryEventType =
  | 'analyzer_completed'
  | 'account_created'
  | 'program_assigned'
  | 'stage_changed'
  | 'task_completed'
  | 'document_uploaded'
  | 'document_reviewed'
  | 'recommendation_generated'
  | 'opportunity_unlocked'
  | 'opportunity_viewed'
  | 'payment_completed'
  | 'membership_activated'
  | 'membership_canceled'
  | 'dispute_generated'
  | 'dispute_sent'
  | 'dispute_resolved'
  | 'funding_approval_logged'
  | 'support_message_sent'
  | 'conversation_archived'
  | 'admin_note_added'
  | 'account_note_added'

/**
 * Log an account event to ai_memory_events.
 * These events are loaded as context by the AI agent so it always knows what has happened.
 */
export async function logMemoryEvent(
  userId: string,
  eventType: AIMemoryEventType,
  eventTitle: string,
  eventDetails?: string,
  relatedRecordId?: string,
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    await supabase.from('ai_memory_events').insert({
      user_id: userId,
      event_type: eventType,
      event_title: eventTitle,
      event_details: eventDetails ?? null,
      related_record_id: relatedRecordId ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    // Never block the main flow — memory logging is best-effort
    console.error('[AI-MEMORY] Failed to log event:', err)
  }
}

/**
 * Update the persistent AI memory profile for a user.
 * The memory profile is a structured summary that persists across conversation rollovers.
 */
export async function updateMemoryProfile(
  userId: string,
  updates: Partial<{
    business_name: string
    program_type: string
    current_stage: string
    goals: string
    key_facts: string
    last_summary: string
    next_steps: string
    total_approved_funding: number
    active_disputes: number
    pending_tasks: number
  }>
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    await supabase.from('ai_memory_profiles').upsert(
      { user_id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  } catch (err) {
    console.error('[AI-MEMORY] Failed to update memory profile:', err)
  }
}

/**
 * Archive a conversation and save its summary to the memory profile.
 * Call this when a conversation becomes too long (token threshold exceeded).
 */
export async function archiveConversation(
  conversationId: string,
  userId: string,
  summary: string,
  nextSteps?: string,
  keyFacts?: string,
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const now = new Date().toISOString()

    // Archive the old conversation
    await supabase.from('ai_conversations').update({
      status: 'archived',
      is_active: false,
      archived_at: now,
      summary,
    }).eq('id', conversationId).eq('user_id', userId)

    // Save summary and next steps into memory profile
    await updateMemoryProfile(userId, {
      last_summary: summary,
      ...(nextSteps ? { next_steps: nextSteps } : {}),
      ...(keyFacts ? { key_facts: keyFacts } : {}),
    })

    // Log the event
    await logMemoryEvent(
      userId,
      'conversation_archived',
      'Chat history archived and progress saved',
      'Prior conversation context has been preserved in your AI memory profile.',
      conversationId,
    )
  } catch (err) {
    console.error('[AI-MEMORY] Failed to archive conversation:', err)
  }
}

/**
 * Get or create the active conversation for a user.
 * If the active conversation exceeds the token threshold, archives it and creates a new one.
 */
export async function getOrCreateActiveConversation(
  userId: string,
  tokenThreshold = 12000,
): Promise<{ id: string; isNew: boolean; wasRolledOver: boolean }> {
  const supabase = await createServiceClient()

  // Find existing active conversation
  const { data: existing } = await supabase
    .from('ai_conversations')
    .select('id, token_estimate, summary')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && (existing.token_estimate ?? 0) < tokenThreshold) {
    return { id: existing.id, isNew: false, wasRolledOver: false }
  }

  // Archive if over threshold
  if (existing) {
    await supabase.from('ai_conversations').update({
      status: 'archived',
      is_active: false,
      archived_at: new Date().toISOString(),
    }).eq('id', existing.id)

    await logMemoryEvent(
      userId,
      'conversation_archived',
      'Chat rolled over to keep things organized',
      'Your progress and history have been saved. Starting a fresh conversation.',
      existing.id,
    )
  }

  // Create a new active conversation
  const { data: newConv } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: userId,
      title: 'Continuing Your Journey',
      status: 'active',
      is_active: true,
      started_at: new Date().toISOString(),
      token_estimate: 0,
    })
    .select('id')
    .single()

  return { id: newConv!.id, isNew: true, wasRolledOver: !!existing }
}
